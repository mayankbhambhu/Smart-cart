import {
  AssignPickerSchema,
  GateVerifySchema,
  IdSchema,
  OpsOrdersQuerySchema,
  SocketEvents,
  UpdateOrderStatusSchema,
  VerifyPickupSchema,
  parsePickupUri,
  type GateEventDto,
  type OpsOverview,
} from '@smartcart/shared';
import { and, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import {
  attendanceRecords,
  devices,
  employees,
  gateEvents,
  instoreSessions,
  orders,
  restockAlerts,
  shifts,
  tasks,
  users,
} from '../../db/schema';
import { AppError, conflict, notFound } from '../../lib/errors';
import { addDays, zonedParts, zonedRange } from '../../lib/time';
import { parse } from '../../lib/validate';
import { broadcast } from '../../realtime/emitter';
import { verifyAtGate } from '../../services/exitPass';
import { loadOrder, updateOrderStatus } from '../../services/orders';
import { liveSessions } from '../../services/sessions';
import { atLeast } from './context';

export const opsOrdersRouter = Router({ mergeParams: true });

// --- Overview ----------------------------------------------------------------------------

opsOrdersRouter.get('/overview', async (req, res) => {
  const { storeId, timezone } = req.staff!;
  const now = new Date();
  const today = zonedParts(now, timezone).date;
  const { start, end } = zonedRange(today, today, timezone);
  const yesterday = zonedRange(addDays(today, -1), addDays(today, -1), timezone);
  const showMoney = atLeast(req, 'FLOOR_MANAGER');

  const sales = (from: Date, to: Date) =>
    db
      .select({
        net: sql<number>`coalesce(sum(${orders.itemTotal} - ${orders.couponDiscount}), 0)::float8`,
        profit: sql<number>`coalesce(sum(${orders.itemTotal} - ${orders.couponDiscount} - ${orders.costTotal}), 0)::float8`,
        orders: sql<number>`count(*)::int`,
        items: sql<number>`coalesce(sum(${orders.itemCount}), 0)::int`,
      })
      .from(orders)
      .where(and(eq(orders.storeId, storeId), gte(orders.placedAt, from), lt(orders.placedAt, to), sql`${orders.status} <> 'CANCELLED'`));

  const [[todaySales], [yesterdaySales], hourly, [shoppers], [alerts], pending, [onDuty], todaysShifts, [taskCounts], [exits], gate] =
    await Promise.all([
      sales(start, end),
      // Same time yesterday, so a morning check-in is not compared with a full day.
      sales(yesterday.start, new Date(Math.min(yesterday.end.getTime(), now.getTime() - 86_400_000))),
      db
        .select({
          hour: sql<number>`extract(hour from ${orders.placedAt} at time zone ${timezone})::int`,
          net: sql<number>`coalesce(sum(${orders.itemTotal} - ${orders.couponDiscount}), 0)::float8`,
          orders: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(
          and(eq(orders.storeId, storeId), gte(orders.placedAt, start), lt(orders.placedAt, end), sql`${orders.status} <> 'CANCELLED'`),
        )
        .groupBy(sql`1`),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(instoreSessions)
        .where(and(eq(instoreSessions.storeId, storeId), inArray(instoreSessions.status, ['ACTIVE', 'CHECKOUT']))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(restockAlerts)
        .where(and(eq(restockAlerts.storeId, storeId), inArray(restockAlerts.status, ['OPEN', 'ACKNOWLEDGED']))),
      db
        .select({ channel: orders.channel, count: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.storeId, storeId), inArray(orders.status, ['PLACED', 'PACKING', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP'])))
        .groupBy(orders.channel),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.storeId, storeId), isNull(attendanceRecords.clockOutAt))),
      db
        .select({ employeeId: shifts.employeeId, startAt: shifts.startAt, endAt: shifts.endAt })
        .from(shifts)
        .where(and(eq(shifts.storeId, storeId), eq(shifts.date, today), eq(shifts.status, 'SCHEDULED'))),
      db
        .select({
          open: sql<number>`count(*) filter (where ${tasks.status} in ('TODO', 'IN_PROGRESS', 'REOPENED'))::int`,
          review: sql<number>`count(*) filter (where ${tasks.status} = 'DONE')::int`,
          overdue: sql<number>`count(*) filter (where ${tasks.status} in ('TODO', 'IN_PROGRESS', 'REOPENED') and ${tasks.dueAt} < now())::int`,
        })
        .from(tasks)
        .where(eq(tasks.storeId, storeId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(gateEvents)
        .where(and(eq(gateEvents.storeId, storeId), eq(gateEvents.result, 'OPENED'), gte(gateEvents.createdAt, start))),
      recentGateEvents(storeId, 8),
    ]);

  const clockedIn = await db
    .select({ employeeId: attendanceRecords.employeeId })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.storeId, storeId), gte(attendanceRecords.clockInAt, start)));
  const present = new Set(clockedIn.map((c) => c.employeeId));
  const notYetIn = todaysShifts.filter((s) => s.startAt <= now && s.endAt > now && !present.has(s.employeeId)).length;
  const money = (value: number) => (showMoney ? value : 0);

  const body: OpsOverview = {
    storeId,
    date: today,
    today: {
      netSales: money(todaySales?.net ?? 0),
      grossProfit: money(atLeast(req, 'STORE_MANAGER') ? (todaySales?.profit ?? 0) : 0),
      orders: todaySales?.orders ?? 0,
      avgOrderValue: money(todaySales && todaySales.orders > 0 ? Math.round(todaySales.net / todaySales.orders) : 0),
      itemsSold: todaySales?.items ?? 0,
      exits: exits?.count ?? 0,
    },
    yesterday: { netSales: money(yesterdaySales?.net ?? 0), orders: yesterdaySales?.orders ?? 0 },
    activeShoppers: shoppers?.count ?? 0,
    openAlerts: alerts?.count ?? 0,
    pendingOrders: {
      delivery: pending.find((p) => p.channel === 'DELIVERY')?.count ?? 0,
      pickup: pending.find((p) => p.channel === 'PICKUP')?.count ?? 0,
    },
    staff: { onDuty: onDuty?.count ?? 0, scheduledToday: todaysShifts.length, notYetIn },
    tasks: { open: taskCounts?.open ?? 0, awaitingReview: taskCounts?.review ?? 0, overdue: taskCounts?.overdue ?? 0 },
    salesByHour: Array.from({ length: 24 }, (_, hour) => {
      const h = hourly.find((x) => x.hour === hour);
      return { hour, netSales: money(h?.net ?? 0), orders: h?.orders ?? 0 };
    }),
    recentGateEvents: gate,
  };
  res.json(body);
});

async function recentGateEvents(storeId: string, limit: number): Promise<GateEventDto[]> {
  const rows = await db
    .select({ event: gateEvents, deviceName: devices.name, orderNumber: orders.orderNumber, customerName: users.name })
    .from(gateEvents)
    .leftJoin(devices, eq(devices.id, gateEvents.deviceId))
    .leftJoin(orders, eq(orders.id, gateEvents.orderId))
    .leftJoin(users, eq(users.id, orders.userId))
    .where(eq(gateEvents.storeId, storeId))
    .orderBy(desc(gateEvents.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.event.id,
    deviceName: r.deviceName ?? 'Staff phone',
    result: r.event.result,
    reason: r.event.reason,
    orderNumber: r.orderNumber,
    customerName: r.customerName,
    at: r.event.createdAt.toISOString(),
  }));
}

// --- Orders board (delivery & pickup) ----------------------------------------------------

opsOrdersRouter.get('/orders', async (req, res) => {
  const { storeId, timezone } = req.staff!;
  const query = parse(OpsOrdersQuerySchema, req.query);
  const conditions: SQL[] = [eq(orders.storeId, storeId)];
  if (query.channel) conditions.push(eq(orders.channel, query.channel));
  if (query.status.length > 0) conditions.push(inArray(orders.status, query.status));
  if (query.q) conditions.push(ilike(orders.orderNumber, `%${query.q}%`));
  if (query.date) {
    const { start, end } = zonedRange(query.date, query.date, timezone);
    conditions.push(
      or(and(gte(orders.createdAt, start), lt(orders.createdAt, end)), and(gte(orders.scheduledFor, start), lt(orders.scheduledFor, end)))!,
    );
  }
  const ids = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(...conditions))
    .orderBy(sql`coalesce(${orders.scheduledFor}, ${orders.createdAt}) asc`)
    .limit(query.limit)
    .offset(query.offset);
  const result = [];
  for (const { id } of ids) result.push((await loadOrder(db, id))!);
  res.json(result);
});

opsOrdersRouter.get('/orders/:orderId', async (req, res) => {
  const orderId = parse(IdSchema, req.params.orderId);
  const order = await loadOrder(db, orderId);
  if (!order || order.storeId !== req.staff!.storeId) throw notFound('Order');
  res.json(order);
});

opsOrdersRouter.post('/orders/:orderId/status', async (req, res) => {
  const orderId = parse(IdSchema, req.params.orderId);
  const input = parse(UpdateOrderStatusSchema, req.body);
  res.json(
    await updateOrderStatus(
      orderId,
      req.staff!.storeId,
      { userId: req.auth!.userId, employeeId: req.staff!.employeeId, name: req.staff!.name },
      input,
    ),
  );
});

opsOrdersRouter.post('/orders/:orderId/picker', async (req, res) => {
  const orderId = parse(IdSchema, req.params.orderId);
  const { employeeId } = parse(AssignPickerSchema, req.body);
  if (employeeId) {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.storeId, req.staff!.storeId), eq(employees.status, 'ACTIVE')))
      .limit(1);
    if (!employee) throw notFound('Employee');
  }
  const updated = await db
    .update(orders)
    .set({ pickerId: employeeId })
    .where(and(eq(orders.id, orderId), eq(orders.storeId, req.staff!.storeId)))
    .returning({ id: orders.id });
  if (updated.length === 0) throw notFound('Order');
  broadcast.toStoreOps(req.staff!.storeId, SocketEvents.ORDER_CHANGED, { orderId });
  res.json(await loadOrder(db, orderId));
});

/** Counter staff scan the customer's pickup QR (or type the code) to hand over the bag. */
opsOrdersRouter.post('/orders/verify-pickup', async (req, res) => {
  const raw = req.body as { scanned?: unknown; orderNumber?: unknown; pickupCode?: unknown };
  const fromQr = typeof raw?.scanned === 'string' ? parsePickupUri(raw.scanned) : null;
  const input = parse(VerifyPickupSchema, fromQr ?? raw);
  const [order] = await db
    .select({ id: orders.id, status: orders.status, pickupCode: orders.pickupCode, channel: orders.channel })
    .from(orders)
    .where(and(eq(orders.orderNumber, input.orderNumber), eq(orders.storeId, req.staff!.storeId)))
    .limit(1);
  if (!order || order.channel !== 'PICKUP') throw notFound('Pickup order');
  if (order.pickupCode !== input.pickupCode) throw new AppError(400, 'PICKUP_CODE_MISMATCH', 'The pickup code does not match this order');
  if (order.status === 'PICKED_UP') throw conflict('This order was already handed over');
  if (order.status !== 'READY_FOR_PICKUP') throw conflict('This order is not packed yet', 'NOT_READY');
  res.json(
    await updateOrderStatus(
      order.id,
      req.staff!.storeId,
      { userId: req.auth!.userId, employeeId: req.staff!.employeeId, name: req.staff!.name },
      { status: 'PICKED_UP', pickupCode: input.pickupCode },
    ),
  );
});

// --- Live in-store activity --------------------------------------------------------------

opsOrdersRouter.get('/sessions', async (req, res) => {
  res.json(await liveSessions(req.staff!.storeId));
});

opsOrdersRouter.get('/gate-events', async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(30) }), req.query);
  res.json(await recentGateEvents(req.staff!.storeId, limit));
});

/** A staff member's phone acting as a manual exit-gate scanner. */
opsOrdersRouter.post('/gate/verify', async (req, res) => {
  const { code } = parse(GateVerifySchema, req.body);
  res.json(await verifyAtGate({ code, storeId: req.staff!.storeId, deviceId: null }));
});
