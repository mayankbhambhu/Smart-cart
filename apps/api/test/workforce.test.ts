import type { AttendanceSummaryRow, Employee, MyAttendance, Shift, Task } from '@smartcart/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { attendanceRecords } from '../src/db/schema';
import { addDays, zonedParts } from '../src/lib/time';
import { api, bearer, staffSession, storeByCode } from './helpers';

let storeId: string;
let team: Employee[];
const today = () => zonedParts(new Date(), 'Asia/Kolkata').date;

beforeAll(async () => {
  storeId = (await storeByCode('BLR-IND-01')).id;
  const manager = await staffSession('kavya.reddy');
  team = (await api().get(`/api/v1/ops/stores/${storeId}/employees`).set(bearer(manager)).expect(200)).body;
});

const employee = (username: string) => team.find((e) => e.username === username)!;

describe('work assignment', () => {
  it('lets the manager assign work, alerts the worker and collects their remark for review', async () => {
    const manager = await staffSession('kavya.reddy');
    const worker = await staffSession('meera.joshi');
    const created = await api()
      .post(`/api/v1/ops/stores/${storeId}/tasks`)
      .set(bearer(manager))
      .send({
        title: 'Face up the snacks aisle',
        category: 'DISPLAY_SETUP',
        priority: 'HIGH',
        assigneeId: employee('meera.joshi').id,
        aisle: 4,
      })
      .expect(201);
    const task = created.body as Task;
    expect(task).toMatchObject({ status: 'TODO', assignee: { name: 'Meera Joshi' }, assignedBy: { name: 'Kavya Reddy' } });

    const inbox = await api().get('/api/v1/me/notifications').set(bearer(worker)).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ type: 'TASK_ASSIGNED' });
    expect(inbox.body.unread).toBeGreaterThan(0);

    const mine = await api()
      .get(`/api/v1/ops/stores/${storeId}/tasks`)
      .query({ scope: 'mine', status: 'TODO' })
      .set(bearer(worker))
      .expect(200);
    expect((mine.body as Task[]).some((t) => t.id === task.id)).toBe(true);

    await api().post(`/api/v1/ops/stores/${storeId}/tasks/${task.id}/complete`).set(bearer(manager)).send({ note: 'not mine' }).expect(403);
    await api().post(`/api/v1/ops/stores/${storeId}/tasks/${task.id}/start`).set(bearer(worker)).expect(200);
    const done = await api()
      .post(`/api/v1/ops/stores/${storeId}/tasks/${task.id}/complete`)
      .set(bearer(worker))
      .send({ note: 'Faced all 4 rows and removed two damaged packs' })
      .expect(200);
    expect(done.body).toMatchObject({ status: 'DONE', completionNote: 'Faced all 4 rows and removed two damaged packs' });

    await api()
      .post(`/api/v1/ops/stores/${storeId}/tasks/${task.id}/review`)
      .set(bearer(manager))
      .send({ decision: 'APPROVE' })
      .expect(400);
    const reviewed = await api()
      .post(`/api/v1/ops/stores/${storeId}/tasks/${task.id}/review`)
      .set(bearer(manager))
      .send({ decision: 'APPROVE', rating: 5, comment: 'Looks great' })
      .expect(200);
    expect(reviewed.body).toMatchObject({ status: 'APPROVED', review: { rating: 5, reviewerName: 'Kavya Reddy' } });
  });

  it('reopens unsatisfactory work with feedback', async () => {
    const floor = await staffSession('vikram.singh');
    const worker = await staffSession('suresh.kumar');
    const created = await api()
      .post(`/api/v1/ops/stores/${storeId}/tasks`)
      .set(bearer(floor))
      .send({ title: 'Mop the entrance', category: 'CLEANING', assigneeId: employee('suresh.kumar').id })
      .expect(201);
    await api()
      .post(`/api/v1/ops/stores/${storeId}/tasks/${created.body.id}/complete`)
      .set(bearer(worker))
      .send({ note: 'Done' })
      .expect(200);
    const reopened = await api()
      .post(`/api/v1/ops/stores/${storeId}/tasks/${created.body.id}/review`)
      .set(bearer(floor))
      .send({ decision: 'REOPEN', comment: 'The mat area is still wet and muddy' })
      .expect(200);
    expect(reopened.body.status).toBe('REOPENED');
  });

  it('enforces who can assign to whom', async () => {
    const worker = await staffSession('rahul.yadav');
    const floor = await staffSession('vikram.singh');
    await api()
      .post(`/api/v1/ops/stores/${storeId}/tasks`)
      .set(bearer(worker))
      .send({ title: 'Do my work', assigneeId: employee('imran.khan').id })
      .expect(403);
    // Floor managers assign to workers, not to other floor managers.
    await api()
      .post(`/api/v1/ops/stores/${storeId}/tasks`)
      .set(bearer(floor))
      .send({ title: 'Cover my shift', assigneeId: employee('ananya.iyer').id })
      .expect(403);
  });
});

describe('shifts and attendance', () => {
  it('plans shifts in bulk and notifies the team', async () => {
    const manager = await staffSession('kavya.reddy');
    const days = [addDays(today(), 10), addDays(today(), 11)];
    const res = await api()
      .post(`/api/v1/ops/stores/${storeId}/shifts`)
      .set(bearer(manager))
      .send({
        employeeIds: [employee('pooja.nair').id, employee('ravi.teja').id],
        dates: days,
        startTime: '22:00',
        endTime: '06:00',
        label: 'Night',
      })
      .expect(201);
    expect(res.body).toHaveLength(4);
    const night = (res.body as Shift[])[0]!;
    expect(new Date(night.endAt).getTime() - new Date(night.startAt).getTime()).toBe(8 * 3600_000);
    // Re-running the same plan does not double-book.
    const again = await api()
      .post(`/api/v1/ops/stores/${storeId}/shifts`)
      .set(bearer(manager))
      .send({ employeeIds: [employee('pooja.nair').id], dates: days, startTime: '22:00', endTime: '06:00' })
      .expect(201);
    expect(again.body).toHaveLength(0);

    const worker = await staffSession('pooja.nair');
    await api()
      .post(`/api/v1/ops/stores/${storeId}/shifts`)
      .set(bearer(worker))
      .send({ employeeIds: [employee('pooja.nair').id], dates: days, startTime: '09:00', endTime: '10:00' })
      .expect(403);
  });

  it('clocks in and out and reports hours, days present and lateness', async () => {
    const worker = await staffSession('joseph.fernandes');
    const record = employee('joseph.fernandes');
    // Clear any open record from the seed so the test controls the state.
    await db.delete(attendanceRecords).where(and(eq(attendanceRecords.employeeId, record.id), isNull(attendanceRecords.clockOutAt)));

    const store = await storeByCode('BLR-IND-01');
    await api()
      .post(`/api/v1/ops/stores/${storeId}/attendance/clock-in`)
      .set(bearer(worker))
      .send({ method: 'APP', lat: store.lat + 0.05, lng: store.lng })
      .expect(400);
    const clockedIn = await api()
      .post(`/api/v1/ops/stores/${storeId}/attendance/clock-in`)
      .set(bearer(worker))
      .send({ method: 'APP', lat: store.lat, lng: store.lng })
      .expect(201);
    expect(clockedIn.body.clockOutAt).toBeNull();
    await api().post(`/api/v1/ops/stores/${storeId}/attendance/clock-in`).set(bearer(worker)).send({ method: 'APP' }).expect(409);

    const me = await api().get(`/api/v1/ops/stores/${storeId}/attendance/me`).set(bearer(worker)).expect(200);
    expect((me.body as MyAttendance).open?.id).toBe(clockedIn.body.id);

    const manager = await staffSession('kavya.reddy');
    const board = await api().get(`/api/v1/ops/stores/${storeId}/attendance/board`).set(bearer(manager)).expect(200);
    expect(board.body.onDuty.some((r: { employee: { id: string } }) => r.employee.id === record.id)).toBe(true);

    await api().post(`/api/v1/ops/stores/${storeId}/attendance/clock-out`).set(bearer(worker)).send({}).expect(200);
    await api().post(`/api/v1/ops/stores/${storeId}/attendance/clock-out`).set(bearer(worker)).send({}).expect(409);

    const summary = await api()
      .get(`/api/v1/ops/stores/${storeId}/attendance/summary`)
      .query({ from: addDays(today(), -9), to: today() })
      .set(bearer(manager))
      .expect(200);
    const row = (summary.body as AttendanceSummaryRow[]).find((r) => r.employee.id === record.id)!;
    expect(row.daysPresent).toBeGreaterThan(3);
    expect(row.minutesWorked).toBeGreaterThan(0);
    expect(row.estimatedPay).toBeGreaterThan(0);

    // Floor managers see attendance but not pay.
    const floor = await staffSession('vikram.singh');
    const floorView = await api()
      .get(`/api/v1/ops/stores/${storeId}/attendance/summary`)
      .query({ from: addDays(today(), -9), to: today() })
      .set(bearer(floor))
      .expect(200);
    expect(floorView.body[0].estimatedPay).toBeNull();
    await api()
      .get(`/api/v1/ops/stores/${storeId}/attendance/summary`)
      .query({ from: today(), to: today() })
      .set(bearer(worker))
      .expect(403);
  });

  it('accepts the rotating kiosk code for clock-in', async () => {
    const worker = await staffSession('lakshmi.pillai');
    const record = employee('lakshmi.pillai');
    await db.delete(attendanceRecords).where(and(eq(attendanceRecords.employeeId, record.id), isNull(attendanceRecords.clockOutAt)));
    const kiosk = await api().get('/api/v1/devices/kiosk/code').set('X-Device-Key', 'scdev_blr-ind-01_kiosk').expect(200);
    await api()
      .post(`/api/v1/ops/stores/${storeId}/attendance/clock-in`)
      .set(bearer(worker))
      .send({ method: 'KIOSK', kioskCode: 'WRONG123' })
      .expect(400);
    const res = await api()
      .post(`/api/v1/ops/stores/${storeId}/attendance/clock-in`)
      .set(bearer(worker))
      .send({ method: 'KIOSK', kioskCode: kiosk.body.code })
      .expect(201);
    expect(res.body.clockInMethod).toBe('KIOSK');
  });

  it('hides wages from floor managers and workers', async () => {
    const floor = await staffSession('vikram.singh');
    const res = await api().get(`/api/v1/ops/stores/${storeId}/employees`).set(bearer(floor)).expect(200);
    expect(res.body.every((e: Employee) => e.wageAmount === null)).toBe(true);
    expect(team.some((e) => e.wageAmount !== null && e.wageAmount > 0)).toBe(true);
  });
});

describe('analytics access', () => {
  it('serves business analytics to owners and managers only', async () => {
    const owner = await staffSession('arjun.mehta');
    const query = { from: addDays(today(), -6), to: today() };
    const summary = await api().get(`/api/v1/ops/stores/${storeId}/analytics/summary`).query(query).set(bearer(owner)).expect(200);
    expect(summary.body.netSales).toBeGreaterThan(0);
    expect(summary.body.grossProfit).toBeLessThan(summary.body.netSales);
    const rush = await api().get(`/api/v1/ops/stores/${storeId}/analytics/rush-hours`).query(query).set(bearer(owner)).expect(200);
    expect(rush.body.hourly).toHaveLength(24);
    const csv = await api().get(`/api/v1/ops/stores/${storeId}/analytics/export.csv`).query(query).set(bearer(owner)).expect(200);
    expect(csv.text.split('\n')[0]).toContain('net_sales');
    const worker = await staffSession('rahul.yadav');
    await api().get(`/api/v1/ops/stores/${storeId}/analytics/summary`).query(query).set(bearer(worker)).expect(403);
  });
});
