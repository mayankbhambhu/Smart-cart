import {
  AlertToTaskSchema,
  AlertsQuerySchema,
  IdSchema,
  InventoryQuerySchema,
  ReceiveStockSchema,
  ResolveAlertSchema,
  RestockSchema,
  StockCountSchema,
  SocketEvents,
  UpdateStoreProductSchema,
  type InventoryMovement,
  type InventoryRow,
} from '@smartcart/shared';
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../../db/client';
import { categories, inventoryMovements, products, restockAlerts, storeProducts, stores, users } from '../../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { transaction } from '../../lib/tx';
import { parse } from '../../lib/validate';
import { broadcast } from '../../realtime/emitter';
import { aisleLabels, locationOf } from '../../services/catalog';
import { changeStock, listAlerts, loadAlert, stockStatusOf } from '../../services/inventory';
import { createTask } from '../../services/workforce';
import { actorOf, atLeast, requireAtLeast } from './context';

export const opsInventoryRouter = Router({ mergeParams: true });

// --- Live inventory ------------------------------------------------------------------

opsInventoryRouter.get('/inventory', async (req, res) => {
  const storeId = req.staff!.storeId;
  const query = parse(InventoryQuerySchema, req.query);
  const conditions: SQL[] = [eq(storeProducts.storeId, storeId)];
  if (query.categoryId) conditions.push(eq(products.categoryId, query.categoryId));
  if (query.aisle) conditions.push(eq(storeProducts.aisle, query.aisle));
  if (query.q) {
    const like = `%${query.q}%`;
    conditions.push(or(ilike(products.name, like), ilike(products.brand, like), ilike(products.sku, like), eq(products.barcode, query.q))!);
  }
  if (query.status === 'LOW')
    conditions.push(sql`${storeProducts.shelfQty} <= ${storeProducts.reorderThreshold} and ${storeProducts.shelfQty} > 0`);
  if (query.status === 'OUT') conditions.push(sql`${storeProducts.shelfQty} = 0`);
  if (query.status === 'OK') conditions.push(sql`${storeProducts.shelfQty} > ${storeProducts.reorderThreshold}`);

  const orderBy =
    query.sort === 'name'
      ? [asc(products.name)]
      : query.sort === 'shelf_asc'
        ? [asc(sql`${storeProducts.shelfQty}::float / greatest(${storeProducts.reorderThreshold}, 1)`), asc(products.name)]
        : query.sort === 'updated'
          ? [desc(storeProducts.updatedAt)]
          : [asc(storeProducts.aisle), asc(storeProducts.row), asc(storeProducts.shelf), asc(products.name)];

  const [store] = await db.select({ layout: stores.layout }).from(stores).where(eq(stores.id, storeId)).limit(1);
  const labels = aisleLabels(store!.layout);
  const rows = await db
    .select({
      sp: storeProducts,
      product: products,
      categoryName: categories.name,
      openAlertId: sql<
        string | null
      >`(select a.id from ${restockAlerts} a where a.store_product_id = ${storeProducts.id} and a.status in ('OPEN', 'ACKNOWLEDGED') limit 1)`,
      total: sql<number>`count(*) over()::int`,
    })
    .from(storeProducts)
    .innerJoin(products, eq(products.id, storeProducts.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(query.limit)
    .offset(query.offset);

  const [counts] = await db
    .select({
      low: sql<number>`count(*) filter (where ${storeProducts.shelfQty} <= ${storeProducts.reorderThreshold} and ${storeProducts.shelfQty} > 0)::int`,
      out: sql<number>`count(*) filter (where ${storeProducts.shelfQty} = 0)::int`,
      ok: sql<number>`count(*) filter (where ${storeProducts.shelfQty} > ${storeProducts.reorderThreshold})::int`,
    })
    .from(storeProducts)
    .where(eq(storeProducts.storeId, storeId));

  const showCost = atLeast(req, 'FLOOR_MANAGER');
  const items: InventoryRow[] = rows.map(({ sp, product, categoryName, openAlertId }) => ({
    storeProductId: sp.id,
    productId: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    unit: product.unit,
    emoji: product.emoji,
    color: product.color,
    imageUrl: product.imageUrl,
    categoryId: product.categoryId,
    categoryName,
    price: sp.price,
    mrp: product.mrp,
    cost: showCost ? sp.cost : 0,
    shelfQty: sp.shelfQty,
    storageQty: sp.storageQty,
    reorderThreshold: sp.reorderThreshold,
    restockTarget: sp.restockTarget,
    location: locationOf(sp, labels),
    isAvailable: sp.isAvailable,
    stockStatus: stockStatusOf(sp),
    openAlertId,
    updatedAt: sp.updatedAt.toISOString(),
  }));
  res.json({ items, total: rows[0]?.total ?? 0, counts: counts ?? { low: 0, out: 0, ok: 0 } });
});

async function ownStoreProduct(storeId: string, storeProductId: string) {
  const [sp] = await db
    .select()
    .from(storeProducts)
    .where(and(eq(storeProducts.id, storeProductId), eq(storeProducts.storeId, storeId)))
    .limit(1);
  if (!sp) throw notFound('Product in this store');
  return sp;
}

opsInventoryRouter.patch('/inventory/:storeProductId', async (req, res) => {
  requireAtLeast(req, 'FLOOR_MANAGER', 'Only managers can change product settings');
  const storeProductId = parse(IdSchema, req.params.storeProductId);
  const input = parse(UpdateStoreProductSchema, req.body);
  if (input.price !== undefined && !atLeast(req, 'STORE_MANAGER')) throw forbidden('Only the store manager or owner can change prices');
  const sp = await ownStoreProduct(req.staff!.storeId, storeProductId);
  const [store] = await db.select({ layout: stores.layout }).from(stores).where(eq(stores.id, sp.storeId)).limit(1);
  const aisle = input.aisle ?? sp.aisle;
  const aisleDef = store!.layout.aisles.find((a) => a.number === aisle);
  if (!aisleDef) throw badRequest(`Aisle ${aisle} does not exist in this store`);
  if ((input.row ?? sp.row) > aisleDef.rows) throw badRequest(`Aisle ${aisle} only has ${aisleDef.rows} rows`);
  await transaction(async (tx, afterCommit) => {
    await tx.update(storeProducts).set(input).where(eq(storeProducts.id, sp.id));
    // Re-evaluate the restock alert when the threshold changes.
    await changeStock(
      tx,
      { storeProductId: sp.id, type: 'ADJUSTMENT', actorId: req.auth!.userId, note: 'Product settings updated' },
      afterCommit,
    );
  });
  res.json({ ok: true });
});

/** Move units from storage to the shelf. */
opsInventoryRouter.post('/inventory/:storeProductId/restock', async (req, res) => {
  const storeProductId = parse(IdSchema, req.params.storeProductId);
  const { quantity, note } = parse(RestockSchema, req.body);
  const sp = await ownStoreProduct(req.staff!.storeId, storeProductId);
  if (sp.storageQty < quantity) throw conflict(`Only ${sp.storageQty} units in storage`, 'INSUFFICIENT_STORAGE');
  const result = await transaction((tx, afterCommit) =>
    changeStock(
      tx,
      { storeProductId: sp.id, shelfDelta: quantity, storageDelta: -quantity, type: 'RESTOCK', actorId: req.auth!.userId, note },
      afterCommit,
    ),
  );
  res.json({ shelfQty: result.row.shelfQty, storageQty: result.row.storageQty, stockStatus: stockStatusOf(result.row) });
});

/** Supplier delivery received into storage. */
opsInventoryRouter.post('/inventory/:storeProductId/receive', async (req, res) => {
  if (!atLeast(req, 'FLOOR_MANAGER') && req.staff!.department !== 'WAREHOUSE')
    throw forbidden('Only warehouse staff and managers can receive stock');
  const storeProductId = parse(IdSchema, req.params.storeProductId);
  const { quantity, note } = parse(ReceiveStockSchema, req.body);
  const sp = await ownStoreProduct(req.staff!.storeId, storeProductId);
  const result = await transaction((tx, afterCommit) =>
    changeStock(tx, { storeProductId: sp.id, storageDelta: quantity, type: 'RECEIVE', actorId: req.auth!.userId, note }, afterCommit),
  );
  res.json({ shelfQty: result.row.shelfQty, storageQty: result.row.storageQty, stockStatus: stockStatusOf(result.row) });
});

/** Stock count correction (cycle count) or damage write-off. */
opsInventoryRouter.post('/inventory/:storeProductId/count', async (req, res) => {
  requireAtLeast(req, 'FLOOR_MANAGER', 'Only managers can correct stock counts');
  const storeProductId = parse(IdSchema, req.params.storeProductId);
  const input = parse(StockCountSchema, req.body);
  const sp = await ownStoreProduct(req.staff!.storeId, storeProductId);
  const result = await transaction((tx, afterCommit) =>
    changeStock(
      tx,
      {
        storeProductId: sp.id,
        shelfDelta: input.shelfQty !== undefined ? input.shelfQty - sp.shelfQty : 0,
        storageDelta: input.storageQty !== undefined ? input.storageQty - sp.storageQty : 0,
        type: input.reason,
        actorId: req.auth!.userId,
        note: input.note,
      },
      afterCommit,
    ),
  );
  res.json({ shelfQty: result.row.shelfQty, storageQty: result.row.storageQty, stockStatus: stockStatusOf(result.row) });
});

opsInventoryRouter.get('/inventory/:storeProductId/movements', async (req, res) => {
  const storeProductId = parse(IdSchema, req.params.storeProductId);
  await ownStoreProduct(req.staff!.storeId, storeProductId);
  const rows = await db
    .select({ movement: inventoryMovements, actorName: users.name })
    .from(inventoryMovements)
    .leftJoin(users, eq(users.id, inventoryMovements.actorId))
    .where(eq(inventoryMovements.storeProductId, storeProductId))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(60);
  const body: InventoryMovement[] = rows.map(({ movement, actorName }) => ({
    id: movement.id,
    type: movement.type,
    shelfDelta: movement.shelfDelta,
    storageDelta: movement.storageDelta,
    note: movement.note,
    actorName,
    refType: movement.refType,
    createdAt: movement.createdAt.toISOString(),
  }));
  res.json(body);
});

// --- Restock alerts --------------------------------------------------------------------

opsInventoryRouter.get('/alerts', async (req, res) => {
  const query = parse(AlertsQuerySchema, req.query);
  const statuses = query.status === 'ACTIVE' ? (['OPEN', 'ACKNOWLEDGED'] as const) : ([query.status] as const);
  res.json(await listAlerts(db, req.staff!.storeId, [...statuses], query.limit));
});

async function ownAlert(storeId: string, alertId: string) {
  const [alert] = await db
    .select()
    .from(restockAlerts)
    .where(and(eq(restockAlerts.id, alertId), eq(restockAlerts.storeId, storeId)))
    .limit(1);
  if (!alert) throw notFound('Alert');
  return alert;
}

opsInventoryRouter.post('/alerts/:alertId/acknowledge', async (req, res) => {
  const alertId = parse(IdSchema, req.params.alertId);
  const alert = await ownAlert(req.staff!.storeId, alertId);
  if (alert.status !== 'OPEN') throw conflict('This alert is already being handled');
  await db
    .update(restockAlerts)
    .set({ status: 'ACKNOWLEDGED', acknowledgedById: req.auth!.userId, acknowledgedAt: new Date() })
    .where(eq(restockAlerts.id, alertId));
  const updated = await loadAlert(db, alertId);
  broadcast.toStoreOps(req.staff!.storeId, SocketEvents.ALERT_CHANGED, updated);
  res.json(updated);
});

/** Restock the shelf from storage and close the alert. */
opsInventoryRouter.post('/alerts/:alertId/resolve', async (req, res) => {
  const alertId = parse(IdSchema, req.params.alertId);
  const { restockQuantity, note } = parse(ResolveAlertSchema, req.body);
  const alert = await ownAlert(req.staff!.storeId, alertId);
  if (alert.status === 'RESOLVED') throw conflict('This alert is already resolved');
  await transaction(async (tx, afterCommit) => {
    if (restockQuantity > 0) {
      const [sp] = await tx.select().from(storeProducts).where(eq(storeProducts.id, alert.storeProductId)).limit(1);
      if (!sp || sp.storageQty < restockQuantity) throw conflict(`Only ${sp?.storageQty ?? 0} units in storage`, 'INSUFFICIENT_STORAGE');
      await changeStock(
        tx,
        {
          storeProductId: alert.storeProductId,
          shelfDelta: restockQuantity,
          storageDelta: -restockQuantity,
          type: 'RESTOCK',
          refType: 'ALERT',
          refId: alert.id,
          actorId: req.auth!.userId,
          note,
        },
        afterCommit,
      );
    }
    // Still at/below the threshold (e.g. storage ran out): close it explicitly.
    await tx
      .update(restockAlerts)
      .set({ status: 'RESOLVED', resolvedById: req.auth!.userId, resolvedAt: new Date(), restockedQty: restockQuantity })
      .where(and(eq(restockAlerts.id, alert.id), inArray(restockAlerts.status, ['OPEN', 'ACKNOWLEDGED'])));
  });
  const updated = await loadAlert(db, alertId);
  broadcast.toStoreOps(req.staff!.storeId, SocketEvents.ALERT_CHANGED, updated);
  res.json(updated);
});

opsInventoryRouter.post('/alerts/:alertId/task', async (req, res) => {
  requireAtLeast(req, 'FLOOR_MANAGER', 'Only managers can assign tasks');
  const alertId = parse(IdSchema, req.params.alertId);
  const input = parse(AlertToTaskSchema, req.body);
  const alert = await loadAlert(db, alertId);
  if (!alert || alert.storeId !== req.staff!.storeId) throw notFound('Alert');
  const task = await createTask(actorOf(req), {
    title: `Restock ${alert.product.name}`,
    description: `Shelf at Aisle ${alert.location.aisle} · Row ${alert.location.row} has ${alert.shelfQty} left. Bring it up to ${alert.restockTarget} from storage (${alert.storageQty} available).`,
    category: 'RESTOCK',
    priority: input.priority,
    assigneeId: input.assigneeId,
    dueAt: input.dueAt,
    aisle: alert.location.aisle,
    restockAlertId: alert.id,
  });
  await db
    .update(restockAlerts)
    .set({ taskId: task.id, status: 'ACKNOWLEDGED', acknowledgedById: req.auth!.userId, acknowledgedAt: new Date() })
    .where(eq(restockAlerts.id, alertId));
  res.status(201).json(task);
});
