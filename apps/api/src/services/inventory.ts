import {
  LOW_STOCK_DISPLAY_THRESHOLD,
  SocketEvents,
  describeLocation,
  type AlertLevel,
  type InventoryMovementType,
  type InventoryUpdateEvent,
  type RestockAlert,
  type StockStatus,
} from '@smartcart/shared';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, type Executor, type Transaction } from '../db/client';
import {
  attendanceRecords,
  employees,
  inventoryMovements,
  products,
  restockAlerts,
  storeProducts,
  stores,
  tasks,
  users,
} from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import type { AfterCommit } from '../lib/tx';
import { broadcast } from '../realtime/emitter';
import { resolveSettings } from '../modules/stores/settings';
import { notifyUsers } from './notifications';

export type StoreProductRow = typeof storeProducts.$inferSelect;

export function stockStatusOf(row: Pick<StoreProductRow, 'shelfQty' | 'storageQty' | 'isAvailable'>): StockStatus {
  const available = row.isAvailable ? row.shelfQty + row.storageQty : 0;
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= LOW_STOCK_DISPLAY_THRESHOLD) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function availableQty(row: Pick<StoreProductRow, 'shelfQty' | 'storageQty' | 'isAvailable'>): number {
  return row.isAvailable ? row.shelfQty + row.storageQty : 0;
}

export interface StockChangeInput {
  storeProductId: string;
  shelfDelta?: number;
  storageDelta?: number;
  type: InventoryMovementType;
  refType?: string;
  refId?: string;
  actorId?: string | null;
  note?: string;
  /**
   * 'strict' rejects changes that would make stock negative.
   * 'clamp' records what is possible: used for smart carts, where the item is
   * physically in the cart even if the system count says otherwise.
   */
  mode?: 'strict' | 'clamp';
}

export interface StockChangeResult {
  row: StoreProductRow;
  shelfDelta: number;
  storageDelta: number;
  productName: string;
}

/**
 * Applies a stock movement atomically: locks the store-product row, updates
 * shelf/storage counts, writes the movement ledger, keeps the restock alert
 * in sync and (after commit) broadcasts the new level to the store's staff.
 */
export async function changeStock(tx: Transaction, input: StockChangeInput, afterCommit: AfterCommit): Promise<StockChangeResult> {
  const [current] = await tx
    .select({ sp: storeProducts, name: products.name })
    .from(storeProducts)
    .innerJoin(products, eq(products.id, storeProducts.productId))
    .where(eq(storeProducts.id, input.storeProductId))
    .for('update', { of: storeProducts });
  if (!current) throw notFound('Product in this store');

  const sp = current.sp;
  let shelf = sp.shelfQty + (input.shelfDelta ?? 0);
  let storage = sp.storageQty + (input.storageDelta ?? 0);
  if (shelf < 0 || storage < 0) {
    if (input.mode !== 'clamp') {
      throw conflict(`Only ${sp.shelfQty + sp.storageQty} of ${current.name} left`, 'INSUFFICIENT_STOCK');
    }
    shelf = Math.max(0, shelf);
    storage = Math.max(0, storage);
  }
  const shelfDelta = shelf - sp.shelfQty;
  const storageDelta = storage - sp.storageQty;

  const [row] = await tx.update(storeProducts).set({ shelfQty: shelf, storageQty: storage }).where(eq(storeProducts.id, sp.id)).returning();

  await tx.insert(inventoryMovements).values({
    storeId: sp.storeId,
    storeProductId: sp.id,
    productId: sp.productId,
    type: input.type,
    shelfDelta,
    storageDelta,
    refType: input.refType ?? null,
    refId: input.refId ?? null,
    actorId: input.actorId ?? null,
    note: input.note ?? null,
  });

  await syncRestockAlert(tx, row!, current.name, afterCommit, {
    actorId: input.actorId ?? null,
    restockedQty: input.type === 'RESTOCK' ? shelfDelta : null,
  });

  const event: InventoryUpdateEvent = {
    storeId: sp.storeId,
    storeProductId: sp.id,
    productId: sp.productId,
    productName: current.name,
    shelfQty: row!.shelfQty,
    storageQty: row!.storageQty,
    stockStatus: stockStatusOf(row!),
    reason: input.type,
    shelfDelta,
    storageDelta,
    at: new Date().toISOString(),
  };
  afterCommit(() => broadcast.toStoreOps(sp.storeId, SocketEvents.INVENTORY_UPDATED, event));

  return { row: row!, shelfDelta, storageDelta, productName: current.name };
}

/**
 * Takes stock for an online order: shelf first, then storage.
 * Rows are locked in a stable order to avoid deadlocks between checkouts.
 */
export async function reserveForOrder(
  tx: Transaction,
  lines: { storeProductId: string; quantity: number }[],
  orderId: string,
  actorId: string,
  afterCommit: AfterCommit,
): Promise<void> {
  const sorted = [...lines].sort((a, b) => a.storeProductId.localeCompare(b.storeProductId));
  for (const line of sorted) {
    const [sp] = await tx.select().from(storeProducts).where(eq(storeProducts.id, line.storeProductId)).for('update');
    if (!sp) throw notFound('Product in this store');
    const fromShelf = Math.min(sp.shelfQty, line.quantity);
    const fromStorage = line.quantity - fromShelf;
    await changeStock(
      tx,
      {
        storeProductId: line.storeProductId,
        shelfDelta: -fromShelf,
        storageDelta: -fromStorage,
        type: 'ORDER_RESERVE',
        refType: 'ORDER',
        refId: orderId,
        actorId,
      },
      afterCommit,
    );
  }
}

/** Returns everything an order reserved (cancellations). */
export async function releaseOrder(tx: Transaction, orderId: string, actorId: string | null, afterCommit: AfterCommit): Promise<void> {
  const movements = await tx
    .select()
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.refType, 'ORDER'), eq(inventoryMovements.refId, orderId)));
  const net = new Map<string, { shelf: number; storage: number }>();
  for (const m of movements) {
    const entry = net.get(m.storeProductId) ?? { shelf: 0, storage: 0 };
    entry.shelf += m.shelfDelta;
    entry.storage += m.storageDelta;
    net.set(m.storeProductId, entry);
  }
  const ids = [...net.keys()].sort();
  for (const storeProductId of ids) {
    const entry = net.get(storeProductId)!;
    if (entry.shelf === 0 && entry.storage === 0) continue;
    await changeStock(
      tx,
      {
        storeProductId,
        shelfDelta: -entry.shelf,
        storageDelta: -entry.storage,
        type: 'ORDER_RELEASE',
        refType: 'ORDER',
        refId: orderId,
        actorId,
        mode: 'clamp',
      },
      afterCommit,
    );
  }
}

// ---------------------------------------------------------------------------
// Restock alerts
// ---------------------------------------------------------------------------

async function syncRestockAlert(
  tx: Transaction,
  sp: StoreProductRow,
  productName: string,
  afterCommit: AfterCommit,
  context: { actorId: string | null; restockedQty: number | null },
): Promise<void> {
  const [active] = await tx
    .select()
    .from(restockAlerts)
    .where(and(eq(restockAlerts.storeProductId, sp.id), inArray(restockAlerts.status, ['OPEN', 'ACKNOWLEDGED'])))
    .limit(1);
  const isLow = sp.isAvailable && sp.shelfQty <= sp.reorderThreshold;
  const level: AlertLevel = sp.shelfQty === 0 ? 'OUT_OF_STOCK' : 'LOW';

  if (isLow && !active) {
    const [alert] = await tx
      .insert(restockAlerts)
      .values({
        storeId: sp.storeId,
        storeProductId: sp.id,
        productId: sp.productId,
        level,
        shelfQtyAtTrigger: sp.shelfQty,
        threshold: sp.reorderThreshold,
      })
      .onConflictDoNothing()
      .returning();
    if (alert) await onAlertRaised(tx, alert, sp, productName, afterCommit);
    return;
  }
  if (isLow && active && active.level !== level) {
    await tx.update(restockAlerts).set({ level }).where(eq(restockAlerts.id, active.id));
    afterCommit(() => broadcastAlert(active.id));
    return;
  }
  if (!isLow && active) {
    await tx
      .update(restockAlerts)
      .set({
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: context.actorId,
        restockedQty: context.restockedQty,
      })
      .where(eq(restockAlerts.id, active.id));
    if (active.taskId && context.restockedQty) {
      await tx
        .update(tasks)
        .set({ status: 'DONE', completedAt: new Date(), completionNote: `Shelf restocked with ${context.restockedQty} units` })
        .where(and(eq(tasks.id, active.taskId), inArray(tasks.status, ['TODO', 'IN_PROGRESS', 'REOPENED'])));
    }
    afterCommit(() => broadcastAlert(active.id));
  }
}

async function onAlertRaised(
  tx: Transaction,
  alert: typeof restockAlerts.$inferSelect,
  sp: StoreProductRow,
  productName: string,
  afterCommit: AfterCommit,
): Promise<void> {
  const [store] = await tx.select({ settings: stores.settings }).from(stores).where(eq(stores.id, sp.storeId));
  const settings = resolveSettings(store?.settings);
  const location = describeLocation({ aisle: sp.aisle, row: sp.row, shelf: sp.shelf });
  const urgent = alert.level === 'OUT_OF_STOCK';

  const staff = await tx
    .select({ id: employees.id, userId: employees.userId, role: employees.role, department: employees.department })
    .from(employees)
    .where(and(eq(employees.storeId, sp.storeId), eq(employees.status, 'ACTIVE')));
  const warehouse = staff.filter((e) => e.department === 'WAREHOUSE');
  const supervisors = staff.filter((e) => e.role === 'FLOOR_MANAGER');

  await notifyUsers(
    tx,
    [...warehouse, ...supervisors].map((e) => e.userId),
    {
      type: 'RESTOCK_ALERT',
      title: urgent ? `Out of stock: ${productName}` : `Running low: ${productName}`,
      body: `${sp.shelfQty} left on the shelf at ${location}. ${sp.storageQty} in storage.`,
      data: { storeId: sp.storeId, alertId: alert.id, productId: sp.productId },
    },
    afterCommit,
  );

  if (settings.autoCreateRestockTasks && warehouse.length > 0 && sp.storageQty > 0) {
    const assignee = await pickRestockAssignee(
      tx,
      sp.storeId,
      warehouse.map((w) => w.id),
    );
    const assigner = staff.find((e) => e.role === 'STORE_MANAGER') ?? staff.find((e) => e.role === 'OWNER') ?? supervisors[0];
    if (assignee && assigner) {
      const quantity = Math.max(1, Math.min(sp.storageQty, sp.restockTarget - sp.shelfQty));
      const [task] = await tx
        .insert(tasks)
        .values({
          storeId: sp.storeId,
          title: `Restock ${productName}`,
          description: `Shelf at ${location} has ${sp.shelfQty} left (threshold ${sp.reorderThreshold}). Move ${quantity} units from storage to the shelf.`,
          category: 'RESTOCK',
          priority: urgent ? 'URGENT' : 'HIGH',
          assigneeId: assignee,
          assignedById: assigner.id,
          aisle: sp.aisle,
          dueAt: new Date(Date.now() + (urgent ? 15 : 45) * 60_000),
          restockAlertId: alert.id,
        })
        .returning({ id: tasks.id });
      await tx.update(restockAlerts).set({ taskId: task!.id }).where(eq(restockAlerts.id, alert.id));
      const assigneeUser = warehouse.find((w) => w.id === assignee)?.userId;
      await notifyUsers(
        tx,
        [assigneeUser],
        {
          type: 'TASK_ASSIGNED',
          title: `New task: Restock ${productName}`,
          body: `${location} · move ${quantity} units from storage`,
          data: { storeId: sp.storeId, taskId: task!.id },
        },
        afterCommit,
      );
      afterCommit(() => broadcast.toStoreOps(sp.storeId, SocketEvents.TASK_CHANGED, { taskId: task!.id }));
    }
  }

  afterCommit(() => broadcastAlert(alert.id));
}

/** Warehouse employee on duty right now with the fewest open tasks (falls back to anyone in warehouse). */
async function pickRestockAssignee(tx: Transaction, storeId: string, candidateIds: string[]): Promise<string | null> {
  if (candidateIds.length === 0) return null;
  const onDuty = await tx
    .select({ employeeId: attendanceRecords.employeeId })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.storeId, storeId),
        inArray(attendanceRecords.employeeId, candidateIds),
        sql`${attendanceRecords.clockOutAt} is null`,
      ),
    );
  const pool = onDuty.length > 0 ? onDuty.map((r) => r.employeeId) : candidateIds;
  const load = await tx
    .select({ assigneeId: tasks.assigneeId, open: count() })
    .from(tasks)
    .where(and(inArray(tasks.assigneeId, pool), inArray(tasks.status, ['TODO', 'IN_PROGRESS', 'REOPENED'])))
    .groupBy(tasks.assigneeId);
  const openByEmployee = new Map(load.map((l) => [l.assigneeId, l.open]));
  return [...pool].sort((a, b) => (openByEmployee.get(a) ?? 0) - (openByEmployee.get(b) ?? 0))[0] ?? null;
}

async function broadcastAlert(alertId: string): Promise<void> {
  const alert = await loadAlert(db, alertId);
  if (alert) broadcast.toStoreOps(alert.storeId, SocketEvents.ALERT_CHANGED, alert);
}

const acknowledgedBy = alias(users, 'acknowledged_by');
const resolvedBy = alias(users, 'resolved_by');

function alertQuery(executor: Executor) {
  return executor
    .select({
      alert: restockAlerts,
      sp: storeProducts,
      product: {
        id: products.id,
        name: products.name,
        brand: products.brand,
        unit: products.unit,
        emoji: products.emoji,
        color: products.color,
        imageUrl: products.imageUrl,
      },
      acknowledgedByName: acknowledgedBy.name,
      resolvedByName: resolvedBy.name,
    })
    .from(restockAlerts)
    .innerJoin(storeProducts, eq(storeProducts.id, restockAlerts.storeProductId))
    .innerJoin(products, eq(products.id, restockAlerts.productId))
    .leftJoin(acknowledgedBy, eq(acknowledgedBy.id, restockAlerts.acknowledgedById))
    .leftJoin(resolvedBy, eq(resolvedBy.id, restockAlerts.resolvedById));
}

type AlertQueryRow = Awaited<ReturnType<typeof alertQuery>>[number];

function serializeAlert(row: AlertQueryRow): RestockAlert {
  const { alert, sp } = row;
  return {
    id: alert.id,
    storeId: alert.storeId,
    status: alert.status,
    level: alert.level,
    product: row.product,
    storeProductId: sp.id,
    location: { aisle: sp.aisle, row: sp.row, shelf: sp.shelf },
    shelfQty: sp.shelfQty,
    storageQty: sp.storageQty,
    threshold: alert.threshold,
    restockTarget: sp.restockTarget,
    needsReorder: sp.storageQty <= sp.reorderThreshold,
    createdAt: alert.createdAt.toISOString(),
    acknowledgedBy: row.acknowledgedByName,
    acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedByName,
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    restockedQty: alert.restockedQty,
    taskId: alert.taskId,
  };
}

export async function loadAlert(executor: Executor, alertId: string): Promise<RestockAlert | null> {
  const [row] = await alertQuery(executor).where(eq(restockAlerts.id, alertId)).limit(1);
  return row ? serializeAlert(row) : null;
}

export async function listAlerts(
  executor: Executor,
  storeId: string,
  statuses: (typeof restockAlerts.$inferSelect)['status'][],
  limit: number,
): Promise<RestockAlert[]> {
  const rows = await alertQuery(executor)
    .where(and(eq(restockAlerts.storeId, storeId), inArray(restockAlerts.status, statuses)))
    .orderBy(sql`case when ${restockAlerts.level} = 'OUT_OF_STOCK' then 0 else 1 end`, asc(restockAlerts.createdAt))
    .limit(limit);
  return rows.map(serializeAlert);
}
