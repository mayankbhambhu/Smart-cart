import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { attendanceRecords, exitPasses, instoreSessions, orders, shifts, stores } from '../db/schema';
import { logger } from '../lib/logger';
import { resolveSettings } from '../modules/stores/settings';
import { cancelOrder } from '../services/orders';
import { endSession } from '../services/sessions';

/**
 * Periodic housekeeping. A Postgres advisory lock makes sure only one API
 * instance runs a sweep at a time when the service is scaled horizontally.
 */

const JOB_LOCK = 7_420_261;
const PENDING_PAYMENT_TIMEOUT_MINUTES = 20;
const FORGOTTEN_CLOCK_OUT_HOURS = 16;

export async function expireIdleSessions(now = new Date()): Promise<number> {
  const storeRows = await db.select({ id: stores.id, settings: stores.settings }).from(stores);
  let expired = 0;
  for (const store of storeRows) {
    const idle = resolveSettings(store.settings).sessionIdleMinutes;
    const stale = await db
      .select({ id: instoreSessions.id })
      .from(instoreSessions)
      .where(
        and(
          eq(instoreSessions.storeId, store.id),
          inArray(instoreSessions.status, ['ACTIVE', 'CHECKOUT']),
          lt(instoreSessions.lastActivityAt, new Date(now.getTime() - idle * 60_000)),
        ),
      );
    for (const session of stale) {
      await endSession(session.id, 'EXPIRED', null);
      expired++;
    }
  }
  return expired;
}

/** Online orders whose payment was never completed release their reserved stock. */
export async function releaseUnpaidOrders(now = new Date()): Promise<number> {
  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'PENDING_PAYMENT'),
        inArray(orders.channel, ['DELIVERY', 'PICKUP']),
        lt(orders.createdAt, new Date(now.getTime() - PENDING_PAYMENT_TIMEOUT_MINUTES * 60_000)),
      ),
    );
  for (const order of stale) {
    await cancelOrder(order.id, { userId: null, name: 'SmartCart', isStaff: true }, 'Payment was not completed in time').catch(
      (error: unknown) => logger.warn({ err: error, orderId: order.id }, 'Could not release unpaid order'),
    );
  }
  return stale.length;
}

export async function expireExitPasses(now = new Date()): Promise<number> {
  const expired = await db
    .update(exitPasses)
    .set({ status: 'EXPIRED' })
    .where(and(eq(exitPasses.status, 'ACTIVE'), lt(exitPasses.expiresAt, now)))
    .returning({ id: exitPasses.id });
  return expired.length;
}

/** Closes attendance records left open overnight (clocked out at shift end, or after 8 hours). */
export async function closeForgottenClockOuts(now = new Date()): Promise<number> {
  const open = await db
    .select({ record: attendanceRecords, shift: shifts })
    .from(attendanceRecords)
    .leftJoin(shifts, eq(shifts.id, attendanceRecords.shiftId))
    .where(and(isNull(attendanceRecords.clockOutAt), lt(attendanceRecords.clockInAt, new Date(now.getTime() - FORGOTTEN_CLOCK_OUT_HOURS * 3600_000))));
  for (const { record, shift } of open) {
    const clockOutAt = shift && shift.endAt > record.clockInAt ? shift.endAt : new Date(record.clockInAt.getTime() + 8 * 3600_000);
    const minutes = Math.round((clockOutAt.getTime() - record.clockInAt.getTime()) / 60_000);
    await db
      .update(attendanceRecords)
      .set({
        clockOutAt,
        clockOutMethod: 'MANUAL',
        workedMinutes: Math.max(0, minutes - (shift?.breakMinutes ?? 0)),
        notes: [record.notes, 'Auto clock-out: no clock-out recorded'].filter(Boolean).join(' · '),
      })
      .where(eq(attendanceRecords.id, record.id));
  }
  return open.length;
}

async function sweep(): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked', [JOB_LOCK]);
    if (!rows[0]?.locked) return;
    try {
      const [sessions, unpaid, passes, attendance] = [
        await expireIdleSessions(),
        await releaseUnpaidOrders(),
        await expireExitPasses(),
        await closeForgottenClockOuts(),
      ];
      if (sessions + unpaid + passes + attendance > 0) {
        logger.info({ sessions, unpaid, passes, attendance }, 'Housekeeping sweep');
      }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [JOB_LOCK]);
    }
  } catch (error) {
    logger.error({ err: error }, 'Housekeeping sweep failed');
  } finally {
    client.release();
  }
}

export function startJobs(intervalMs = 60_000): () => void {
  const timer = setInterval(() => void sweep(), intervalMs);
  timer.unref();
  void sweep();
  return () => clearInterval(timer);
}
