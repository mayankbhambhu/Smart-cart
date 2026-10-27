import {
  GATE_REASON_LABELS,
  SocketEvents,
  buildExitPassUri,
  parseExitPassToken,
  type ExitPass,
  type GateReason,
  type GateVerifyResult,
} from '@smartcart/shared';
import { and, eq } from 'drizzle-orm';
import { db, type Transaction } from '../db/client';
import { devices, exitPasses, gateEvents, orders, users } from '../db/schema';
import { randomCode, sha256 } from '../lib/crypto';
import { AppError, notFound } from '../lib/errors';
import { broadcast } from '../realtime/emitter';

export type ExitPassRow = typeof exitPasses.$inferSelect;

export function newExitToken(): string {
  return `SC${randomCode(18)}`;
}

export function serializeExitPass(row: ExitPassRow, token: string | null = null): ExitPass {
  return {
    id: row.id,
    token,
    uri: token ? buildExitPassUri(token) : null,
    hint: row.tokenHint,
    status: row.status === 'ACTIVE' && row.expiresAt < new Date() ? 'EXPIRED' : row.status,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt?.toISOString() ?? null,
  };
}

/** Creates the one-time exit pass for a paid in-store order. Returns the plain token once. */
export async function issueExitPass(
  tx: Transaction,
  order: { id: string; storeId: string; userId: string },
  ttlMinutes: number,
): Promise<{ row: ExitPassRow; token: string }> {
  const token = newExitToken();
  const [row] = await tx
    .insert(exitPasses)
    .values({
      orderId: order.id,
      storeId: order.storeId,
      userId: order.userId,
      tokenHash: sha256(token),
      tokenHint: token.slice(-4),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    })
    .returning();
  return { row: row!, token };
}

/**
 * Re-issues the token of a still-valid pass (e.g. the app was reinstalled).
 * Only the newest token works, so a screenshot shared earlier stops working.
 */
export async function revealExitPass(orderId: string, userId: string): Promise<ExitPass> {
  const [pass] = await db
    .select()
    .from(exitPasses)
    .where(and(eq(exitPasses.orderId, orderId), eq(exitPasses.userId, userId)))
    .limit(1);
  if (!pass) throw notFound('Exit pass');
  if (pass.status !== 'ACTIVE') return serializeExitPass(pass);
  if (pass.expiresAt < new Date()) {
    const [expired] = await db.update(exitPasses).set({ status: 'EXPIRED' }).where(eq(exitPasses.id, pass.id)).returning();
    return serializeExitPass(expired!);
  }
  const token = newExitToken();
  const [updated] = await db
    .update(exitPasses)
    .set({ tokenHash: sha256(token), tokenHint: token.slice(-4) })
    .where(and(eq(exitPasses.id, pass.id), eq(exitPasses.status, 'ACTIVE')))
    .returning();
  if (!updated) throw new AppError(409, 'PASS_CHANGED', 'The exit pass was just used');
  return serializeExitPass(updated, token);
}

/**
 * Exit-gate check. The gate (or a staff member's phone) sends whatever it
 * scanned; the pass must belong to this store, be paid, unexpired and unused.
 * Marking it used is atomic, so two gates can never both open for one pass.
 */
export async function verifyAtGate(input: { code: string; storeId: string; deviceId: string | null }): Promise<GateVerifyResult> {
  const deny = async (reason: GateReason, passId: string | null = null, orderId: string | null = null): Promise<GateVerifyResult> => {
    await logGateEvent(input.storeId, input.deviceId, passId, orderId, 'DENIED', reason);
    return { open: false, result: 'DENIED', reason, message: GATE_REASON_LABELS[reason], order: null };
  };

  const token = parseExitPassToken(input.code);
  if (!token) return deny('MALFORMED');
  const [pass] = await db
    .select()
    .from(exitPasses)
    .where(eq(exitPasses.tokenHash, sha256(token)))
    .limit(1);
  if (!pass) return deny('NOT_FOUND');
  if (pass.storeId !== input.storeId) return deny('WRONG_STORE', pass.id, pass.orderId);

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      itemCount: orders.itemCount,
      total: orders.total,
      paymentStatus: orders.paymentStatus,
      placedAt: orders.placedAt,
      userId: orders.userId,
      customerName: users.name,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, pass.orderId))
    .limit(1);
  if (!order || order.paymentStatus !== 'PAID') return deny('UNPAID', pass.id, pass.orderId);
  if (pass.status === 'USED') return deny('ALREADY_USED', pass.id, pass.orderId);
  if (pass.status === 'REVOKED') return deny('REVOKED', pass.id, pass.orderId);
  if (pass.status === 'EXPIRED' || pass.expiresAt < new Date()) {
    await db.update(exitPasses).set({ status: 'EXPIRED' }).where(eq(exitPasses.id, pass.id));
    return deny('EXPIRED', pass.id, pass.orderId);
  }

  const [used] = await db
    .update(exitPasses)
    .set({ status: 'USED', usedAt: new Date(), usedAtDeviceId: input.deviceId })
    .where(and(eq(exitPasses.id, pass.id), eq(exitPasses.status, 'ACTIVE')))
    .returning();
  if (!used) return deny('ALREADY_USED', pass.id, pass.orderId);

  await logGateEvent(input.storeId, input.deviceId, pass.id, order.id, 'OPENED', 'OK');
  const passDto = serializeExitPass(used);
  broadcast.toOrder(order.id, SocketEvents.ORDER_CHANGED, { orderId: order.id, exitPass: passDto });
  broadcast.toUser(order.userId, SocketEvents.ORDER_CHANGED, { orderId: order.id, exitPass: passDto });
  return {
    open: true,
    result: 'OPENED',
    reason: 'OK',
    message: GATE_REASON_LABELS.OK,
    order: {
      orderNumber: order.orderNumber,
      itemCount: order.itemCount,
      total: order.total,
      customerName: order.customerName,
      paidAt: order.placedAt?.toISOString() ?? null,
    },
  };
}

async function logGateEvent(
  storeId: string,
  deviceId: string | null,
  exitPassId: string | null,
  orderId: string | null,
  result: 'OPENED' | 'DENIED',
  reason: GateReason,
): Promise<void> {
  const [event] = await db.insert(gateEvents).values({ storeId, deviceId, exitPassId, orderId, result, reason }).returning();
  let deviceName = 'Staff phone';
  if (deviceId) {
    const [device] = await db.select({ name: devices.name }).from(devices).where(eq(devices.id, deviceId)).limit(1);
    deviceName = device?.name ?? deviceName;
  }
  let orderNumber: string | null = null;
  let customerName: string | null = null;
  if (orderId) {
    const [row] = await db
      .select({ orderNumber: orders.orderNumber, customerName: users.name })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.id, orderId))
      .limit(1);
    orderNumber = row?.orderNumber ?? null;
    customerName = row?.customerName ?? null;
  }
  broadcast.toStoreOps(storeId, SocketEvents.GATE_EVENT, {
    id: event!.id,
    deviceName,
    result,
    reason,
    orderNumber,
    customerName,
    at: event!.createdAt.toISOString(),
  });
}
