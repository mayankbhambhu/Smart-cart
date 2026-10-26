import {
  SocketEvents,
  computeBill,
  type CheckoutResult,
  type InStoreSession,
  type SessionChange,
  type SessionCheckoutInput,
  type SessionUpdateEvent,
} from '@smartcart/shared';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { db, type Executor, type Transaction } from '../db/client';
import {
  devices,
  instoreSessionItems,
  instoreSessions,
  listItems,
  listMembers,
  orderEvents,
  orderItems,
  orders,
  payments,
  products,
  storeProducts,
  stores,
  users,
} from '../db/schema';
import { randomDigits } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, isUniqueViolation, notFound, unprocessable } from '../lib/errors';
import { transaction, type AfterCommit } from '../lib/tx';
import { resolveSettings } from '../modules/stores/settings';
import { broadcast, rooms } from '../realtime/emitter';
import { aisleLabels, locationOf } from './catalog';
import { changeStock } from './inventory';
import { publishListChange, serializeItem } from './lists';
import { findOffer, generateOrderNumber, loadOrder } from './orders';
import { assertMethodAllowed, providerFor, startProviderPayment } from './payments';
import { storeFees } from './stores';

type SessionRow = typeof instoreSessions.$inferSelect;
const ACTIVE_STATES = ['ACTIVE', 'CHECKOUT'] as const;

export async function serializeSession(executor: Executor, sessionId: string): Promise<InStoreSession> {
  const [row] = await executor
    .select({ session: instoreSessions, store: stores, deviceName: devices.name })
    .from(instoreSessions)
    .innerJoin(stores, eq(stores.id, instoreSessions.storeId))
    .leftJoin(devices, eq(devices.id, instoreSessions.cartDeviceId))
    .where(eq(instoreSessions.id, sessionId))
    .limit(1);
  if (!row) throw notFound('Shopping session');
  const labels = aisleLabels(row.store.layout);
  const items = await executor
    .select({ item: instoreSessionItems, product: products, sp: storeProducts })
    .from(instoreSessionItems)
    .innerJoin(products, eq(products.id, instoreSessionItems.productId))
    .innerJoin(storeProducts, eq(storeProducts.id, instoreSessionItems.storeProductId))
    .where(eq(instoreSessionItems.sessionId, sessionId))
    .orderBy(asc(instoreSessionItems.createdAt));
  const settings = resolveSettings(row.store.settings);
  const { bill } = computeBill({
    lines: items.map(({ item, product }) => ({
      productId: product.id,
      categoryId: product.categoryId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      mrp: product.mrp,
      taxRate: product.taxRate,
    })),
    channel: 'IN_STORE',
    fees: storeFees(settings),
  });
  const { session } = row;
  return {
    id: session.id,
    storeId: session.storeId,
    storeName: row.store.name,
    status: session.status,
    pairingCode: session.pairingCode,
    listId: session.listId,
    cartDevice: session.cartDeviceId && row.deviceName ? { id: session.cartDeviceId, name: row.deviceName } : null,
    items: items.map(({ item, product, sp }) => ({
      id: item.id,
      productId: product.id,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      emoji: product.emoji,
      color: product.color,
      imageUrl: product.imageUrl,
      barcode: product.barcode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      mrp: product.mrp,
      lineTotal: item.unitPrice * item.quantity,
      location: locationOf(sp, labels),
      addedVia: item.addedVia,
    })),
    bill,
    orderId: session.orderId,
    startedAt: session.startedAt.toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
    expiresAt: new Date(session.lastActivityAt.getTime() + settings.sessionIdleMinutes * 60_000).toISOString(),
  };
}

function publishSession(afterCommit: AfterCommit, session: Pick<SessionRow, 'id' | 'userId' | 'storeId'>, change: SessionChange | null) {
  afterCommit(async () => {
    const payload: SessionUpdateEvent = { session: await serializeSession(db, session.id), change };
    broadcast.toRooms([rooms.session(session.id), rooms.user(session.userId)], SocketEvents.SESSION_UPDATED, payload);
    broadcast.toStoreOps(session.storeId, SocketEvents.SESSION_UPDATED, payload);
  });
}

export async function activeSessionFor(userId: string): Promise<InStoreSession | null> {
  const [session] = await db
    .select({ id: instoreSessions.id })
    .from(instoreSessions)
    .where(and(eq(instoreSessions.userId, userId), inArray(instoreSessions.status, [...ACTIVE_STATES])))
    .orderBy(asc(instoreSessions.startedAt))
    .limit(1);
  return session ? serializeSession(db, session.id) : null;
}

export async function ownSession(sessionId: string, userId: string): Promise<SessionRow> {
  const [session] = await db.select().from(instoreSessions).where(eq(instoreSessions.id, sessionId)).limit(1);
  if (!session) throw notFound('Shopping session');
  if (session.userId !== userId) throw forbidden('This is not your shopping session');
  return session;
}

async function assertListMember(executor: Executor, listId: string, userId: string): Promise<void> {
  const [member] = await executor
    .select({ listId: listMembers.listId })
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
    .limit(1);
  if (!member) throw forbidden('You are not a member of that list');
}

export async function startSession(userId: string, storeId: string, listId?: string): Promise<InStoreSession> {
  const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) throw notFound('Store');
  if (store.status !== 'ACTIVE' || !store.supportsInStore) {
    throw unprocessable('Scan & Go is not available at this store', 'CHANNEL_UNAVAILABLE');
  }
  if (listId) await assertListMember(db, listId, userId);

  const [existing] = await db
    .select()
    .from(instoreSessions)
    .where(and(eq(instoreSessions.userId, userId), inArray(instoreSessions.status, [...ACTIVE_STATES])))
    .limit(1);
  if (existing && existing.storeId === storeId) {
    if (listId && existing.listId !== listId) {
      await db.update(instoreSessions).set({ listId }).where(eq(instoreSessions.id, existing.id));
    }
    return serializeSession(db, existing.id);
  }
  if (existing) await endSession(existing.id, 'ABANDONED', userId);

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const [session] = await db
        .insert(instoreSessions)
        .values({ storeId, userId, listId: listId ?? null, pairingCode: randomDigits(6) })
        .returning();
      return serializeSession(db, session!.id);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new AppError(503, 'BUSY', 'Could not start a session, please try again');
}

export async function linkList(sessionId: string, userId: string, listId: string | null): Promise<InStoreSession> {
  const session = await ownSession(sessionId, userId);
  if (listId) await assertListMember(db, listId, userId);
  await db.update(instoreSessions).set({ listId, lastActivityAt: new Date() }).where(eq(instoreSessions.id, session.id));
  return serializeSession(db, session.id);
}

/**
 * Item dropped into the cart (scanned by the phone or the smart cart). The
 * unit is deducted from the shelf immediately; if the store's count was
 * already zero the scan still succeeds (the item is physically in the cart)
 * and the movement is clamped so stock never goes negative.
 */
export async function addItem(
  sessionId: string,
  input: { productId?: string; barcode?: string; quantity: number },
  source: 'APP' | 'SMART_CART',
  actorId: string | null,
): Promise<SessionUpdateEvent> {
  const change = await transaction(async (tx, afterCommit) => {
    const [session] = await tx.select().from(instoreSessions).where(eq(instoreSessions.id, sessionId)).for('update');
    if (!session) throw notFound('Shopping session');
    if (session.status !== 'ACTIVE') throw conflict('This shopping session is no longer active', 'SESSION_CLOSED');

    const [match] = await tx
      .select({ sp: storeProducts, product: products })
      .from(storeProducts)
      .innerJoin(products, eq(products.id, storeProducts.productId))
      .where(
        and(
          eq(storeProducts.storeId, session.storeId),
          input.productId ? eq(products.id, input.productId) : eq(products.barcode, input.barcode!),
        ),
      )
      .limit(1);
    if (!match) throw notFound(input.barcode ? 'No product with this barcode in this store' : 'Product in this store');
    if (!match.sp.isAvailable) throw unprocessable(`${match.product.name} is not sold at this store right now`, 'NOT_SOLD_HERE');

    const [existing] = await tx
      .select()
      .from(instoreSessionItems)
      .where(and(eq(instoreSessionItems.sessionId, session.id), eq(instoreSessionItems.productId, match.product.id)))
      .limit(1);
    const newQuantity = (existing?.quantity ?? 0) + input.quantity;
    if (newQuantity > 50) throw badRequest('You can add at most 50 of one item');
    if (existing) {
      await tx.update(instoreSessionItems).set({ quantity: newQuantity }).where(eq(instoreSessionItems.id, existing.id));
    } else {
      await tx.insert(instoreSessionItems).values({
        sessionId: session.id,
        productId: match.product.id,
        storeProductId: match.sp.id,
        quantity: input.quantity,
        unitPrice: match.sp.price,
        addedVia: source,
      });
    }
    await changeStock(
      tx,
      {
        storeProductId: match.sp.id,
        shelfDelta: -input.quantity,
        type: 'CART_ADD',
        refType: 'SESSION',
        refId: session.id,
        actorId,
        mode: 'clamp',
      },
      afterCommit,
    );
    await tx.update(instoreSessions).set({ lastActivityAt: new Date() }).where(eq(instoreSessions.id, session.id));
    if (session.listId) await tickListItem(tx, session, match.product.id, afterCommit);

    const change: SessionChange = {
      type: existing ? 'UPDATED' : 'ADDED',
      productId: match.product.id,
      productName: match.product.name,
      quantity: newQuantity,
      source,
    };
    publishSession(afterCommit, session, change);
    return change;
  });
  return { session: await serializeSession(db, sessionId), change };
}

/** Marks the matching family-list item as picked so everyone at home sees it. */
async function tickListItem(tx: Transaction, session: SessionRow, productId: string, afterCommit: AfterCommit): Promise<void> {
  const [item] = await tx
    .select({ id: listItems.id })
    .from(listItems)
    .where(and(eq(listItems.listId, session.listId!), eq(listItems.productId, productId), eq(listItems.isChecked, false)))
    .limit(1);
  if (!item) return;
  await tx
    .update(listItems)
    .set({ isChecked: true, checkedById: session.userId, checkedAt: new Date() })
    .where(eq(listItems.id, item.id));
  afterCommit(async () => {
    const [shopper] = await db.select({ name: users.name }).from(users).where(eq(users.id, session.userId)).limit(1);
    const listItem = await serializeItem(item.id, session.listId!, session.storeId);
    await publishListChange(session.listId!, 'ITEM_UPDATED', { id: session.userId, name: shopper?.name ?? 'Shopper' }, { item: listItem });
  });
}

export async function setItemQuantity(
  sessionId: string,
  itemId: string,
  quantity: number,
  source: 'APP' | 'SMART_CART',
  actorId: string | null,
): Promise<SessionUpdateEvent> {
  const change = await transaction(async (tx, afterCommit) => {
    const [session] = await tx.select().from(instoreSessions).where(eq(instoreSessions.id, sessionId)).for('update');
    if (!session) throw notFound('Shopping session');
    if (session.status !== 'ACTIVE') throw conflict('This shopping session is no longer active', 'SESSION_CLOSED');
    const [item] = await tx
      .select({ item: instoreSessionItems, name: products.name })
      .from(instoreSessionItems)
      .innerJoin(products, eq(products.id, instoreSessionItems.productId))
      .where(and(eq(instoreSessionItems.id, itemId), eq(instoreSessionItems.sessionId, sessionId)))
      .limit(1);
    if (!item) throw notFound('Cart item');
    const delta = quantity - item.item.quantity;
    if (delta === 0) return null;
    if (quantity === 0) await tx.delete(instoreSessionItems).where(eq(instoreSessionItems.id, itemId));
    else await tx.update(instoreSessionItems).set({ quantity }).where(eq(instoreSessionItems.id, itemId));
    await changeStock(
      tx,
      {
        storeProductId: item.item.storeProductId,
        shelfDelta: -delta,
        type: delta > 0 ? 'CART_ADD' : 'CART_REMOVE',
        refType: 'SESSION',
        refId: sessionId,
        actorId,
        mode: 'clamp',
      },
      afterCommit,
    );
    await tx.update(instoreSessions).set({ lastActivityAt: new Date() }).where(eq(instoreSessions.id, sessionId));
    const change: SessionChange = {
      type: quantity === 0 ? 'REMOVED' : 'UPDATED',
      productId: item.item.productId,
      productName: item.name,
      quantity,
      source,
    };
    publishSession(afterCommit, session, change);
    return change;
  });
  return { session: await serializeSession(db, sessionId), change };
}

/** Returns every item to the shelf and closes the session. */
export async function endSession(sessionId: string, status: 'ABANDONED' | 'EXPIRED', actorId: string | null): Promise<void> {
  let pendingOrderId: string | null = null;
  await transaction(async (tx, afterCommit) => {
    const [session] = await tx.select().from(instoreSessions).where(eq(instoreSessions.id, sessionId)).for('update');
    if (!session || !ACTIVE_STATES.includes(session.status as (typeof ACTIVE_STATES)[number])) return;
    pendingOrderId = session.status === 'CHECKOUT' ? session.orderId : null;
    const items = await tx.select().from(instoreSessionItems).where(eq(instoreSessionItems.sessionId, sessionId));
    for (const item of [...items].sort((a, b) => a.storeProductId.localeCompare(b.storeProductId))) {
      await changeStock(
        tx,
        {
          storeProductId: item.storeProductId,
          shelfDelta: item.quantity,
          type: status === 'EXPIRED' ? 'CART_EXPIRED' : 'CART_REMOVE',
          refType: 'SESSION',
          refId: sessionId,
          actorId,
          note: status === 'EXPIRED' ? 'Idle session expired; items returned to shelf' : 'Shopping session cancelled',
        },
        afterCommit,
      );
    }
    await tx.update(instoreSessions).set({ status, endedAt: new Date(), cartDeviceId: null }).where(eq(instoreSessions.id, sessionId));
    publishSession(afterCommit, session, null);
  });
  if (pendingOrderId) await cancelPendingOrder(pendingOrderId, 'Shopping session ended');
}

/** Cancels the unpaid order of an abandoned in-store checkout (nothing to restock or refund). */
async function cancelPendingOrder(orderId: string, reason: string): Promise<void> {
  const cancelled = await db
    .update(orders)
    .set({ status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'PENDING_PAYMENT')))
    .returning({ id: orders.id });
  if (cancelled.length === 0) return;
  await db.insert(orderEvents).values({ orderId, status: 'CANCELLED', note: reason });
  await db
    .update(payments)
    .set({ status: 'CANCELLED' })
    .where(and(eq(payments.orderId, orderId), inArray(payments.status, ['CREATED', 'REQUIRES_ACTION', 'PROCESSING'])));
}

/** Creates the in-store order and starts payment (Apple Pay / Google Pay / UPI / card / PayPal). */
export async function checkout(sessionId: string, userId: string, input: SessionCheckoutInput): Promise<CheckoutResult> {
  const session = await ownSession(sessionId, userId);
  if (session.status === 'CHECKOUT' && session.orderId) await resume(sessionId, userId);
  assertMethodAllowed(input.paymentMethod, 'IN_STORE');
  const provider = providerFor(input.paymentMethod);

  const { orderId, payment } = await transaction(async (tx, afterCommit) => {
    const [locked] = await tx.select().from(instoreSessions).where(eq(instoreSessions.id, sessionId)).for('update');
    if (!locked || locked.status !== 'ACTIVE') throw conflict('This shopping session is no longer active', 'SESSION_CLOSED');
    const [store] = await tx.select().from(stores).where(eq(stores.id, locked.storeId)).limit(1);
    const items = await tx
      .select({ item: instoreSessionItems, product: products, sp: storeProducts })
      .from(instoreSessionItems)
      .innerJoin(products, eq(products.id, instoreSessionItems.productId))
      .innerJoin(storeProducts, eq(storeProducts.id, instoreSessionItems.storeProductId))
      .where(eq(instoreSessionItems.sessionId, sessionId));
    if (items.length === 0) throw badRequest('Your cart is empty. Scan something first!');

    const lines = items.map(({ item, product }) => ({
      productId: product.id,
      categoryId: product.categoryId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      mrp: product.mrp,
      taxRate: product.taxRate,
    }));
    const offer = input.couponCode ? await findOffer(tx, locked.storeId, input.couponCode) : null;
    const { bill, offer: evaluation } = computeBill({
      lines,
      channel: 'IN_STORE',
      fees: storeFees(resolveSettings(store!.settings)),
      offer,
    });
    if (input.couponCode && !evaluation?.applicable) {
      throw unprocessable(evaluation?.message ?? 'This code is not valid', 'OFFER_NOT_APPLICABLE');
    }
    const [customer] = await tx.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber: await generateOrderNumber(tx),
        userId,
        storeId: locked.storeId,
        channel: 'IN_STORE',
        status: 'PENDING_PAYMENT',
        paymentMethod: input.paymentMethod,
        itemCount: bill.itemCount,
        itemTotal: bill.itemTotal,
        mrpTotal: bill.mrpTotal,
        couponDiscount: bill.couponDiscount,
        taxIncluded: bill.taxIncluded,
        total: bill.total,
        costTotal: items.reduce((sum, { item, sp }) => sum + sp.cost * item.quantity, 0),
        offerId: evaluation?.applicable ? evaluation.offerId : null,
        couponCode: evaluation?.applicable ? evaluation.code : null,
        sessionId: locked.id,
      })
      .returning();
    await tx.insert(orderItems).values(
      items.map(({ item, product, sp }) => ({
        orderId: order!.id,
        productId: product.id,
        categoryId: product.categoryId,
        name: product.name,
        brand: product.brand,
        unit: product.unit,
        emoji: product.emoji,
        color: product.color,
        barcode: product.barcode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        mrp: product.mrp,
        unitCost: sp.cost,
        taxRate: product.taxRate,
        lineTotal: item.unitPrice * item.quantity,
        aisle: sp.aisle,
        row: sp.row,
        shelf: sp.shelf,
      })),
    );
    await tx.insert(orderEvents).values({ orderId: order!.id, status: 'PENDING_PAYMENT', actorId: userId, actorName: customer?.name ?? null });
    const [paymentRow] = await tx
      .insert(payments)
      .values({ orderId: order!.id, userId, provider, method: input.paymentMethod, amount: bill.total, savedPaymentMethodId: input.savedPaymentMethodId ?? null })
      .returning();
    await tx.update(instoreSessions).set({ status: 'CHECKOUT', orderId: order!.id, lastActivityAt: new Date() }).where(eq(instoreSessions.id, locked.id));
    publishSession(afterCommit, locked, null);
    return { orderId: order!.id, payment: paymentRow! };
  });

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const order = (await loadOrder(db, orderId))!;
  const paymentInfo = await startProviderPayment(payment, {
    orderNumber: order.orderNumber,
    customer: { id: userId, name: user!.name, email: user!.email, phone: user!.phone },
  });
  return { order, payment: paymentInfo };
}

/** Back to shopping after an abandoned checkout: cancels the unpaid order. */
export async function resume(sessionId: string, userId: string): Promise<InStoreSession> {
  const session = await ownSession(sessionId, userId);
  if (session.status === 'CHECKOUT' && session.orderId) {
    await cancelPendingOrder(session.orderId, 'Customer went back to shopping');
    await db.update(instoreSessions).set({ status: 'ACTIVE', orderId: null }).where(eq(instoreSessions.id, sessionId));
  }
  return serializeSession(db, sessionId);
}

// ---------------------------------------------------------------------------
// Smart-cart hardware
// ---------------------------------------------------------------------------

export async function pairCart(device: { id: string; storeId: string }, pairingCode: string): Promise<InStoreSession> {
  const [session] = await db
    .select()
    .from(instoreSessions)
    .where(and(eq(instoreSessions.storeId, device.storeId), eq(instoreSessions.pairingCode, pairingCode), eq(instoreSessions.status, 'ACTIVE')))
    .limit(1);
  if (!session) throw notFound('No active shopping session with this code in this store');
  await db
    .update(instoreSessions)
    .set({ cartDeviceId: null })
    .where(and(eq(instoreSessions.cartDeviceId, device.id), inArray(instoreSessions.status, [...ACTIVE_STATES])));
  await db.update(instoreSessions).set({ cartDeviceId: device.id, lastActivityAt: new Date() }).where(eq(instoreSessions.id, session.id));
  const serialized = await serializeSession(db, session.id);
  const payload: SessionUpdateEvent = { session: serialized, change: null };
  broadcast.toRooms([rooms.session(session.id), rooms.user(session.userId)], SocketEvents.SESSION_UPDATED, payload);
  return serialized;
}

export async function cartSessionFor(deviceId: string): Promise<SessionRow | null> {
  const [session] = await db
    .select()
    .from(instoreSessions)
    .where(and(eq(instoreSessions.cartDeviceId, deviceId), or(eq(instoreSessions.status, 'ACTIVE'), eq(instoreSessions.status, 'CHECKOUT'))))
    .limit(1);
  return session ?? null;
}

/** Barcode event from a smart cart's scanner / weight sensor (+1 dropped in, -1 taken out). */
export async function cartScan(device: { id: string }, barcode: string, quantity: number): Promise<SessionUpdateEvent> {
  const session = await cartSessionFor(device.id);
  if (!session) throw conflict('This cart is not paired with a shopper. Scan the code in the SmartCart app.', 'CART_NOT_PAIRED');
  if (quantity > 0) return addItem(session.id, { barcode, quantity }, 'SMART_CART', null);
  const [item] = await db
    .select({ id: instoreSessionItems.id, quantity: instoreSessionItems.quantity })
    .from(instoreSessionItems)
    .innerJoin(products, eq(products.id, instoreSessionItems.productId))
    .where(and(eq(instoreSessionItems.sessionId, session.id), eq(products.barcode, barcode)))
    .limit(1);
  if (!item) throw notFound('That item is not in the cart');
  return setItemQuantity(session.id, item.id, Math.max(0, item.quantity + quantity), 'SMART_CART', null);
}

export async function unpairCart(deviceId: string): Promise<void> {
  const session = await cartSessionFor(deviceId);
  await db.update(instoreSessions).set({ cartDeviceId: null }).where(eq(instoreSessions.cartDeviceId, deviceId));
  if (session) {
    const payload: SessionUpdateEvent = { session: await serializeSession(db, session.id), change: null };
    broadcast.toRooms([rooms.session(session.id), rooms.user(session.userId)], SocketEvents.SESSION_UPDATED, payload);
  }
}

/** Live shoppers in a store, for the operations dashboard. */
export async function liveSessions(storeId: string): Promise<(InStoreSession & { customerName: string })[]> {
  const rows = await db
    .select({ id: instoreSessions.id, customerName: users.name })
    .from(instoreSessions)
    .innerJoin(users, eq(users.id, instoreSessions.userId))
    .where(and(eq(instoreSessions.storeId, storeId), inArray(instoreSessions.status, [...ACTIVE_STATES])))
    .orderBy(asc(instoreSessions.startedAt));
  const result: (InStoreSession & { customerName: string })[] = [];
  for (const row of rows) result.push({ ...(await serializeSession(db, row.id)), customerName: row.customerName });
  return result;
}
