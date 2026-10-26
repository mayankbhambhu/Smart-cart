import { describe, expect, it } from 'vitest';
import { PASSWORDS, api, bearer, customerSession, newCustomer, staffSession } from './helpers';

describe('customer authentication', () => {
  it('registers with email and signs in again', async () => {
    const email = `new.${Date.now()}@example.com`;
    const registered = await api()
      .post('/api/v1/auth/register')
      .send({ name: 'Ananya Test', email, password: 'Secret123' })
      .expect(201);
    expect(registered.body.user).toMatchObject({ kind: 'CUSTOMER', email, name: 'Ananya Test' });
    expect(registered.body.accessToken).toBeTypeOf('string');
    expect(registered.headers['set-cookie']?.[0]).toMatch(/sc_refresh=.*HttpOnly/i);

    await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' }).expect(200);
    const wrong = await api().post('/api/v1/auth/login').send({ email, password: 'nope' }).expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    await api().post('/api/v1/auth/register').send({ name: 'Dup', email, password: 'Secret123' }).expect(409);
  });

  it('validates input with field-level errors', async () => {
    const res = await api().post('/api/v1/auth/register').send({ name: 'A', email: 'bad', password: 'short' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields.map((f: { path: string }) => f.path)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('signs up with a phone OTP and asks new users for their name', async () => {
    const phone = '+919812345678';
    const first = await api().post('/api/v1/auth/otp/request').send({ phone: '98123 45678' }).expect(200);
    expect(first.body.devCode).toMatch(/^\d{6}$/);
    await api().post('/api/v1/auth/otp/verify').send({ phone, code: '000000' }).expect(400);
    const nameless = await api().post('/api/v1/auth/otp/verify').send({ phone, code: first.body.devCode }).expect(422);
    expect(nameless.body.error.code).toBe('NAME_REQUIRED');
    const done = await api().post('/api/v1/auth/otp/verify').send({ phone, code: first.body.devCode, name: 'Kiran OTP' }).expect(200);
    expect(done.body.user).toMatchObject({ phone, name: 'Kiran OTP' });
  });

  it('supports demo Google / Apple sign-in in development', async () => {
    const res = await api()
      .post('/api/v1/auth/demo-social')
      .send({ provider: 'google', email: 'social@example.com', name: 'Social Shopper' })
      .expect(200);
    expect(res.body.user.email).toBe('social@example.com');
    const again = await api()
      .post('/api/v1/auth/demo-social')
      .send({ provider: 'google', email: 'social@example.com', name: 'Social Shopper' })
      .expect(200);
    expect(again.body.user.id).toBe(res.body.user.id);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const session = await newCustomer('Refresh Tester');
    const rotated = await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(200);
    expect(rotated.body.refreshToken).not.toBe(session.refreshToken);
    // Re-using the old token revokes the whole family, including the new token.
    await api().post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
  });

  it('protects customer endpoints', async () => {
    await api().get('/api/v1/me/profile').expect(401);
    const priya = await customerSession();
    const profile = await api().get('/api/v1/me/profile').set(bearer(priya)).expect(200);
    expect(profile.body.dietaryPreferences).toContain('VEGETARIAN');
    expect(profile.body.stats.orders).toBeGreaterThan(0);
  });
});

describe('staff and admin authentication', () => {
  it('signs staff in by username or employee code and lists their stores', async () => {
    const owner = await staffSession('arjun.mehta');
    expect(owner.user.kind).toBe('STAFF');
    expect(owner.memberships.map((m) => m.storeCode).sort()).toEqual(['BLR-IND-01', 'BLR-KOR-02']);
    const manager = await staffSession('kavya.reddy');
    const code = manager.memberships[0]!.employeeCode;
    const byCode = await api().post('/api/v1/auth/staff/login').send({ identifier: code, password: PASSWORDS.staff }).expect(200);
    expect(byCode.body.user.id).toBe(manager.user.id);
  });

  it('keeps account types apart', async () => {
    const priya = await customerSession();
    const worker = await staffSession('rahul.yadav');
    await api().get('/api/v1/admin/overview').set(bearer(priya)).expect(403);
    await api().get('/api/v1/admin/overview').set(bearer(worker)).expect(403);
    const storeId = worker.memberships[0]!.storeId;
    await api().get(`/api/v1/ops/stores/${storeId}/tasks`).set(bearer(priya)).expect(403);
    // A staff member of one store cannot reach another store.
    const bandraManager = await staffSession('rohan.kulkarni');
    await api().get(`/api/v1/ops/stores/${storeId}/tasks`).set(bearer(bandraManager)).expect(403);
  });

  it('signs in admins by email', async () => {
    const res = await api().post('/api/v1/auth/admin/login').send({ email: 'admin@smartcart.dev', password: PASSWORDS.admin }).expect(200);
    expect(res.body.user).toMatchObject({ kind: 'ADMIN', adminRole: 'SUPER_ADMIN' });
  });
});
