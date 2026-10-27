import type { CredentialRequest } from '@smartcart/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../src/lib/time';
import { adminSession, api, bearer, staffSession, storeByCode } from './helpers';

let storeId: string;

const candidate = () => ({
  fullName: 'Sanjay Bhosle',
  email: `sanjay.${Date.now()}@gmail.com`,
  phone: `+9198${String(Date.now()).slice(-8)}`,
  role: 'WORKER',
  department: 'WAREHOUSE',
  designation: 'Stock associate',
  joiningDate: addDays(new Date().toISOString().slice(0, 10), 3),
  wageType: 'MONTHLY',
  wageAmount: 1_900_000,
  idProofType: 'AADHAAR',
  idProofLast4: '4321',
});

beforeAll(async () => {
  storeId = (await storeByCode('BLR-IND-01')).id;
});

describe('staff login requests: store manager -> owner -> admin', () => {
  it('runs the full approval chain with send-backs and issues working credentials', async () => {
    const manager = await staffSession('kavya.reddy');
    const owner = await staffSession('arjun.mehta');
    const admin = await adminSession('ops@smartcart.dev');
    const base = `/api/v1/ops/stores/${storeId}/requests`;

    // 1. Store manager raises the request.
    const created = await api().post(base).set(bearer(manager)).send(candidate()).expect(201);
    let request = created.body as CredentialRequest;
    expect(request).toMatchObject({ status: 'PENDING_OWNER', requestedBy: { name: 'Kavya Reddy' } });
    expect(request.requestNumber).toMatch(/^REQ-\d{4}-\d{4}$/);

    // Admin cannot act before the owner has approved.
    await api().post(`/api/v1/admin/requests/${request.id}/review`).set(bearer(admin)).send({ decision: 'APPROVE' }).expect(409);
    // Managers cannot approve their own requests.
    await api().post(`${base}/${request.id}/review`).set(bearer(manager)).send({ decision: 'APPROVE' }).expect(403);

    // 2. Owner sends it back; manager fixes and resubmits.
    await api().post(`${base}/${request.id}/review`).set(bearer(owner)).send({ decision: 'REQUEST_CHANGES' }).expect(400);
    request = (
      await api()
        .post(`${base}/${request.id}/review`)
        .set(bearer(owner))
        .send({ decision: 'REQUEST_CHANGES', comment: 'Add the emergency contact' })
        .expect(200)
    ).body;
    expect(request.status).toBe('OWNER_CHANGES_REQUESTED');
    request = (
      await api()
        .patch(`${base}/${request.id}`)
        .set(bearer(manager))
        .send({ emergencyContactName: 'Sunita Bhosle', emergencyContactPhone: '+919800011122' })
        .expect(200)
    ).body;
    request = (await api().post(`${base}/${request.id}/resubmit`).set(bearer(manager)).send({ comment: 'Added' }).expect(200)).body;
    expect(request).toMatchObject({ status: 'PENDING_OWNER', revision: 2 });

    // 3. Owner approves; it goes to the SmartCart admin team.
    request = (await api().post(`${base}/${request.id}/review`).set(bearer(owner)).send({ decision: 'APPROVE' }).expect(200)).body;
    expect(request.status).toBe('PENDING_ADMIN');
    const queue = await api().get('/api/v1/admin/requests').query({ status: 'PENDING_ADMIN' }).set(bearer(admin)).expect(200);
    expect(queue.body.items.some((r: CredentialRequest) => r.id === request.id)).toBe(true);

    // 4. Admin sends back; the owner corrects and resubmits straight to admin.
    const sentBack = await api()
      .post(`/api/v1/admin/requests/${request.id}/review`)
      .set(bearer(admin))
      .send({ decision: 'REQUEST_CHANGES', comment: 'Joining date must be a working day' })
      .expect(200);
    expect(sentBack.body.request.status).toBe('ADMIN_CHANGES_REQUESTED');
    await api()
      .patch(`${base}/${request.id}`)
      .set(bearer(owner))
      .send({ joiningDate: addDays(new Date().toISOString().slice(0, 10), 5) })
      .expect(200);
    request = (await api().post(`${base}/${request.id}/resubmit`).set(bearer(owner)).send({}).expect(200)).body;
    expect(request.status).toBe('PENDING_ADMIN');

    // 5. Admin approves and gets the one-time credentials.
    const approved = await api()
      .post(`/api/v1/admin/requests/${request.id}/review`)
      .set(bearer(admin))
      .send({ decision: 'APPROVE' })
      .expect(200);
    expect(approved.body.request.status).toBe('APPROVED');
    const credentials = approved.body.credentials;
    expect(credentials.username).toMatch(/^sanjay\.bhosle/);
    expect(credentials.employeeCode).toMatch(/^BLR-IND-01-\d{3}$/);
    expect(approved.body.request.events.map((e: { action: string }) => e.action)).toEqual([
      'SUBMITTED',
      'OWNER_REQUESTED_CHANGES',
      'EDITED',
      'RESUBMITTED',
      'OWNER_APPROVED',
      'ADMIN_REQUESTED_CHANGES',
      'EDITED',
      'RESUBMITTED',
      'ADMIN_APPROVED',
    ]);

    // The new employee signs in, must change the temporary password, then works normally.
    const login = await api()
      .post('/api/v1/auth/staff/login')
      .send({ identifier: credentials.username, password: credentials.temporaryPassword })
      .expect(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    expect(login.body.memberships[0]).toMatchObject({ storeCode: 'BLR-IND-01', role: 'WORKER', department: 'WAREHOUSE' });
    const changed = await api()
      .post('/api/v1/auth/change-password')
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .send({ currentPassword: credentials.temporaryPassword, newPassword: 'Warehouse99' })
      .expect(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    // The pre-change access token no longer works.
    await api()
      .get('/api/v1/auth/me')
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .expect(401);
    const newToken = { Authorization: `Bearer ${changed.body.accessToken}` };
    await api().get(`/api/v1/ops/stores/${storeId}/attendance/me`).set(newToken).expect(200);

    // 6. The employee leaves: admin deletes the account, access stops immediately.
    const offboarded = await api()
      .post(`/api/v1/admin/employees/${credentials.employeeId}/offboard`)
      .set(bearer(admin))
      .send({ reason: 'LEFT', note: 'Resigned for higher studies' })
      .expect(200);
    expect(offboarded.body).toMatchObject({ status: 'LEFT', exitReason: 'Resigned for higher studies' });
    await api().get(`/api/v1/ops/stores/${storeId}/attendance/me`).set(newToken).expect(401);
    await api().post('/api/v1/auth/staff/login').send({ identifier: credentials.username, password: 'Warehouse99' }).expect(401);

    const audit = await api().get('/api/v1/admin/audit').set(bearer(admin)).expect(200);
    expect(audit.body.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(['CREDENTIALS_ISSUED', 'EMPLOYEE_OFFBOARDED']),
    );
  });

  it('lets the owner request a store manager directly to admin', async () => {
    const owner = await staffSession('arjun.mehta');
    const res = await api()
      .post(`/api/v1/ops/stores/${storeId}/requests`)
      .set(bearer(owner))
      .send({ ...candidate(), fullName: 'Meghna Shah', role: 'STORE_MANAGER', department: 'MANAGEMENT' })
      .expect(201);
    expect(res.body.status).toBe('PENDING_ADMIN');
    const manager = await staffSession('kavya.reddy');
    await api()
      .post(`/api/v1/ops/stores/${storeId}/requests`)
      .set(bearer(manager))
      .send({ ...candidate(), role: 'STORE_MANAGER', department: 'MANAGEMENT' })
      .expect(403);
    const worker = await staffSession('rahul.yadav');
    await api().post(`/api/v1/ops/stores/${storeId}/requests`).set(bearer(worker)).send(candidate()).expect(403);
  });
});

describe('admin console', () => {
  it('shows stores with owners, staff and wages', async () => {
    const admin = await adminSession();
    const stores = await api().get('/api/v1/admin/stores').set(bearer(admin)).expect(200);
    const indiranagar = stores.body.find((s: { code: string }) => s.code === 'BLR-IND-01');
    expect(indiranagar.owner.name).toBe('Arjun Mehta');
    expect(indiranagar.monthlyWageBill).toBeGreaterThan(0);
    const detail = await api().get(`/api/v1/admin/stores/${indiranagar.id}`).set(bearer(admin)).expect(200);
    const kavya = detail.body.employees.find((e: { name: string }) => e.name === 'Kavya Reddy');
    expect(kavya).toMatchObject({ role: 'STORE_MANAGER', wageType: 'MONTHLY' });
    expect(kavya.joiningDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(kavya.phone).toMatch(/^\+91/);
  });

  it('onboards a new store with an owner login', async () => {
    const admin = await adminSession();
    const res = await api()
      .post('/api/v1/admin/stores')
      .set(bearer(admin))
      .send({
        code: 'PUN-KOR-01',
        name: 'SmartCart Koregaon Park',
        addressLine: 'Lane 6, Koregaon Park',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        lat: 18.5362,
        lng: 73.8939,
        phone: '+912040001004',
        newOwner: { fullName: 'Rhea Kulkarni', email: 'rhea.owner@example.com', phone: '+919822000004' },
      })
      .expect(201);
    expect(res.body.store.status).toBe('ONBOARDING');
    const login = await api()
      .post('/api/v1/auth/staff/login')
      .send({ identifier: res.body.ownerCredentials.username, password: res.body.ownerCredentials.temporaryPassword })
      .expect(200);
    expect(login.body.memberships[0]).toMatchObject({ storeCode: 'PUN-KOR-01', role: 'OWNER' });
  });

  it('handles store requests (tickets) with replies and internal notes', async () => {
    const manager = await staffSession('kavya.reddy');
    const admin = await adminSession('support@smartcart.dev');
    const created = await api()
      .post(`/api/v1/ops/stores/${storeId}/tickets`)
      .set(bearer(manager))
      .send({
        category: 'HARDWARE',
        priority: 'HIGH',
        subject: 'Smart Cart 01 scanner is dead',
        description: 'The barcode scanner on cart 01 stopped reading items this morning.',
      })
      .expect(201);
    expect(created.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{4}$/);
    await api()
      .post(`/api/v1/admin/tickets/${created.body.id}/messages`)
      .set(bearer(admin))
      .send({ body: 'Vendor SLA is 24h', isInternal: true })
      .expect(200);
    await api()
      .post(`/api/v1/admin/tickets/${created.body.id}/messages`)
      .set(bearer(admin))
      .send({ body: 'A replacement is on the way.' })
      .expect(200);
    await api().patch(`/api/v1/admin/tickets/${created.body.id}`).set(bearer(admin)).send({ status: 'WAITING_ON_STORE' }).expect(200);
    const storeView = await api().get(`/api/v1/ops/stores/${storeId}/tickets/${created.body.id}`).set(bearer(manager)).expect(200);
    expect(storeView.body.messages.map((m: { body: string }) => m.body)).toEqual(['A replacement is on the way.']);
    const reply = await api()
      .post(`/api/v1/ops/stores/${storeId}/tickets/${created.body.id}/messages`)
      .set(bearer(manager))
      .send({ body: 'Received, thanks!' })
      .expect(200);
    expect(reply.body.status).toBe('IN_PROGRESS');
  });

  it('shows platform-wide KPIs', async () => {
    const admin = await adminSession();
    const res = await api().get('/api/v1/admin/overview').set(bearer(admin)).expect(200);
    expect(res.body.stores.total).toBeGreaterThanOrEqual(3);
    expect(res.body.salesByStore.length).toBeGreaterThanOrEqual(3);
    expect(res.body.trend).toHaveLength(30);
  });
});
