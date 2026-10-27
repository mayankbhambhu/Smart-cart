import {
  ORDER_STATUS_LABELS,
  ORDER_STAFF_TRANSITIONS,
  SocketEvents,
  computeBill,
  haversineKm,
  type AppliedOffer,
  type Bill,
  type CheckoutResult,
  type OfferRule,
  type Order,
  type OrderChannel,
  type OrderStatus,
  type OrderSummary,
  type PaymentMethodType,
  type PlaceOrderInput,
  type PricingLine,
  type QuoteInput,
  type QuoteResult,
} from '@smartcart/shared';
import { and, count, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db, type Executor, type Transaction } from '../db/client';
import {
  addresses,
  customerProfiles,
  instoreSessions,
  offerRedemptions,
  offers,
  orderEvents,
  orderItems,
  orders,
  paymentMethods,
  payments,
  storeProducts,
  users,
} from '../db/schema';
import { randomCode } from '../lib/crypto';
import { AppError, badRequest, conflict, forbidden, notFound, unprocessable } from '../lib/errors';
import { logger } from '../lib/logger';
import { transaction, type AfterCommit } from '../lib/tx';
import { isOpenAt } from '../lib/time';
import { resolveSettings } from '../modules/stores/settings';
import { broadcast } from '../realtime/emitter';
import { loadCatalogContext, catalogProductsByIds, locationOf } from './catalog';
import { issueExitPass, serializeExitPass } from './exitPass';
import { releaseOrder, reserveForOrder } from './inventory';
import { notifyUsers } from './notifications';
import {
  assertMethodAllowed,
  providerFor,
  refundWithProvider,
  startProviderPayment,
  toPaymentInfo,
  type PaymentRow,
  type VerificationResult,
} from './payments';
import { getStore, isValidPickupSlot, pickupSlots, storeFees, type StoreRow } from './stores';

type OrderRow = typeof orders.$inferSelect;

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function billOf(order: OrderRow): Bill {
  return {
    itemCount: order.itemCount,
    itemTotal: order.itemTotal,
    mrpTotal: order.mrpTotal,
    itemSavings: order.mrpTotal - order.itemTotal,
    couponDiscount: order.couponDiscount,
    deliveryFee: order.deliveryFee,
    handlingFee: order.handlingFee,
    smallCartFee: order.smallCartFee,
    tip: order.tip,
    taxIncluded: order.taxIncluded,
    total: order.total,
    totalSavings: order.mrpTotal - order.itemTotal + order.couponDiscount,
  };
}

export async function loadOrder(executor: Executor, orderId: string, exitToken: string | null = null): Promise<Order | null> {
  const row = await executor.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: {
      items: true,
      events: { orderBy: (e, { asc: ascending }) => [ascending(e.createdAt)] },
      store: true,
      exitPass: true,
      user: true,
      picker: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    channel: row.channel,
    status: row.status,
    paymentStatus: row.paymentStatus,
    paymentMethod: row.paymentMethod,
    storeId: row.storeId,
    storeName: row.store.name,
    total: row.total,
    itemCount: row.itemCount,
    previewEmojis: row.items.slice(0, 4).map((i) => i.emoji),
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    placedAt: row.placedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      brand: item.brand,
      unit: item.unit,
      emoji: item.emoji,
      color: item.color,
      imageUrl: null,
      barcode: item.barcode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      mrp: item.mrp,
      lineTotal: item.lineTotal,
      location:
        item.aisle !== null && item.row !== null && item.shelf !== null
          ? locationOf({ aisle: item.aisle, row: item.row, shelf: item.shelf })
          : null,
    })),
    bill: billOf(row),
    couponCode: row.couponCode,
    address: row.address,
    slotEnd: row.slotEnd?.toISOString() ?? null,
    pickupCode: row.pickupCode,
    notes: row.notes,
    events: row.events.map((e) => ({ status: e.status, note: e.note, actorName: e.actorName, at: e.createdAt.toISOString() })),
    exitPass: row.exitPass ? serializeExitPass(row.exitPass, exitToken) : null,
    deliveryEtaMinutes: row.deliveryEtaMinutes,
    outForDeliveryAt: row.outForDeliveryAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    rider: row.riderName ? { name: row.riderName, phone: row.riderPhone ?? '' } : null,
    store: {
      id: row.store.id,
      name: row.store.name,
      addressLine: row.store.addressLine,
      lat: row.store.lat,
      lng: row.store.lng,
      phone: row.store.phone,
    },
    customer: { id: row.user.id, name: row.user.name, phone: row.user.phone },
    picker: row.picker ? { id: row.picker.id, name: row.picker.fullName } : null,
  };
}

export function summarize(order: Order): OrderSummary {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    channel: order.channel,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    storeId: order.storeId,
    storeName: order.storeName,
    total: order.total,
    itemCount: order.itemCount,
    previewEmojis: order.previewEmojis,
    scheduledFor: order.scheduledFor,
    placedAt: order.placedAt,
    createdAt: order.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export async function findOffer(
  executor: Executor,
  storeId: string,
  code: string,
): Promise<(OfferRule & { usageLimitPerUser: number | null }) | null> {
  const now = new Date();
  const [offer] = await executor
    .select()
    .from(offers)
    .where(
      and(
        eq(offers.code, code.toUpperCase()),
        eq(offers.isActive, true),
        lte(offers.startsAt, now),
        gt(offers.endsAt, now),
        or(isNull(offers.storeId), eq(offers.storeId, storeId)),
      ),
    )
    .limit(1);
  if (!offer) return null;
  return {
    id: offer.id,
    code: offer.code,
    title: offer.title,
    type: offer.type,
    value: offer.value,
    minOrderValue: offer.minOrderValue,
    maxDiscount: offer.maxDiscount,
    productId: offer.productId,
    categoryId: offer.categoryId,
    buyQty: offer.buyQty,
    getQty: offer.getQty,
    channels: offer.channels,
    usageLimitPerUser: offer.usageLimitPerUser,
  };
}

export interface PricedCart {
  store: StoreRow;
  lines: (PricingLine & {
    storeProductId: string;
    name: string;
    brand: string;
    unit: string;
    emoji: string;
    color: string;
    imageUrl: string | null;
    barcode: string;
    unitCost: number;
    aisle: number;
    row: number;
    shelf: number;
    availableQty: number;
  })[];
  unavailable: QuoteResult['unavailable'];
  bill: Bill;
  offer: AppliedOffer | null;
  offerId: string | null;
}

/** Prices a cart with live store prices, stock and the requested coupon. */
export async function priceCart(
  executor: Executor,
  input: { storeId: string; channel: OrderChannel; items: { productId: string; quantity: number }[]; couponCode?: string; tip?: number },
  userId: string | null,
): Promise<PricedCart> {
  const store = await getStore(executor, input.storeId);
  const context = await loadCatalogContext(executor, store.id, store.layout);
  const catalog = await catalogProductsByIds(
    executor,
    store.id,
    input.items.map((i) => i.productId),
    context,
  );
  const spRows = await executor
    .select()
    .from(storeProducts)
    .where(
      and(
        eq(storeProducts.storeId, store.id),
        inArray(
          storeProducts.productId,
          input.items.map((i) => i.productId),
        ),
      ),
    );
  const spByProduct = new Map(spRows.map((sp) => [sp.productId, sp]));

  const merged = new Map<string, number>();
  for (const item of input.items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);

  const lines: PricedCart['lines'] = [];
  const unavailable: PricedCart['unavailable'] = [];
  for (const [productId, quantity] of merged) {
    const product = catalog.get(productId);
    const sp = spByProduct.get(productId);
    if (!product || !sp) {
      unavailable.push({ productId, name: 'Unavailable item', requested: quantity, available: 0 });
      continue;
    }
    const limit = Math.min(product.maxOrderQty, sp.isAvailable ? sp.shelfQty + sp.storageQty : 0);
    if (quantity > limit) unavailable.push({ productId, name: product.name, requested: quantity, available: limit });
    lines.push({
      productId,
      categoryId: product.categoryId,
      quantity,
      unitPrice: sp.price,
      mrp: product.mrp,
      taxRate: product.taxRate,
      storeProductId: sp.id,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      emoji: product.emoji,
      color: product.color,
      imageUrl: product.imageUrl,
      barcode: product.barcode,
      unitCost: sp.cost,
      aisle: sp.aisle,
      row: sp.row,
      shelf: sp.shelf,
      availableQty: limit,
    });
  }

  let offerRule: Awaited<ReturnType<typeof findOffer>> = null;
  let blockedMessage: string | null = null;
  if (input.couponCode) {
    offerRule = await findOffer(executor, store.id, input.couponCode);
    if (offerRule && offerRule.usageLimitPerUser && userId) {
      const [used] = await executor
        .select({ count: count() })
        .from(offerRedemptions)
        .where(and(eq(offerRedemptions.offerId, offerRule.id), eq(offerRedemptions.userId, userId)));
      if ((used?.count ?? 0) >= offerRule.usageLimitPerUser) blockedMessage = 'You have already used this offer';
    }
  }
  const { bill, offer } = computeBill({
    lines,
    channel: input.channel,
    fees: storeFees(resolveSettings(store.settings)),
    offer: blockedMessage ? null : offerRule,
    tip: input.tip,
  });

  let applied: AppliedOffer | null = offer;
  if (input.couponCode && !offerRule) {
    applied = {
      offerId: '',
      code: input.couponCode,
      title: input.couponCode,
      applicable: false,
      discount: 0,
      message: 'This code is not valid',
    };
  } else if (offerRule && blockedMessage) {
    applied = {
      offerId: offerRule.id,
      code: offerRule.code,
      title: offerRule.title,
      applicable: false,
      discount: 0,
      message: blockedMessage,
    };
  }
  return { store, lines, unavailable, bill, offer: applied, offerId: applied?.applicable ? applied.offerId : null };
}

export async function quote(input: QuoteInput, userId: string | null): Promise<QuoteResult> {
  const priced = await priceCart(db, input, userId);
  const settings = resolveSettings(priced.store.settings);
  return {
    storeId: priced.store.id,
    channel: input.channel,
    lines: priced.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      brand: l.brand,
      unit: l.unit,
      emoji: l.emoji,
      color: l.color,
      imageUrl: l.imageUrl,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      mrp: l.mrp,
      lineTotal: l.unitPrice * l.quantity,
      availableQty: l.availableQty,
      available: l.quantity <= l.availableQty,
    })),
    bill: priced.bill,
    offer: priced.offer,
    unavailable: priced.unavailable,
    deliveryEtaMinutes: input.channel === 'DELIVERY' ? settings.deliveryEtaMinutes : null,
  };
}

// ---------------------------------------------------------------------------
// Placing orders (delivery & pickup)
// ---------------------------------------------------------------------------

export async function generateOrderNumber(executor: Executor): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `SC${randomCode(8)}`;
    const [taken] = await executor.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, candidate)).limit(1);
    if (!taken) return candidate;
  }
  throw new Error('Could not allocate an order number');
}

async function savedMethodFor(userId: string, id: string | undefined, method: PaymentMethodType) {
  if (!id) return null;
  const [saved] = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, userId)))
    .limit(1);
  if (!saved) throw notFound('Saved payment method');
  if (saved.type !== method && !(saved.type === 'CARD' && (method === 'APPLE_PAY' || method === 'GOOGLE_PAY'))) {
    throw badRequest('The saved payment method does not match the selected method');
  }
  return saved;
}

async function customerContext(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound('Customer');
  return { id: user.id, name: user.name, email: user.email, phone: user.phone };
}

export async function placeOrder(userId: string, input: PlaceOrderInput): Promise<CheckoutResult> {
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.orderId, existing.id))
        .orderBy(sql`${payments.createdAt} desc`)
        .limit(1);
      return { order: (await loadOrder(db, existing.id))!, payment: toPaymentInfo(payment!) };
    }
  }

  const store = await getStore(db, input.storeId);
  const settings = resolveSettings(store.settings);
  if (store.status !== 'ACTIVE') throw unprocessable('This store is not taking orders right now', 'STORE_UNAVAILABLE');
  assertMethodAllowed(input.paymentMethod, input.channel);
  const provider = providerFor(input.paymentMethod);
  const saved = await savedMethodFor(userId, input.savedPaymentMethodId, input.paymentMethod);

  let addressSnapshot: OrderRow['address'] = null;
  let scheduledFor: Date | null = null;
  let slotEnd: Date | null = null;
  if (input.channel === 'DELIVERY') {
    if (!store.supportsDelivery) throw unprocessable('This store does not deliver', 'CHANNEL_UNAVAILABLE');
    if (!isOpenAt(new Date(), store.timezone, store.openingTime, store.closingTime)) {
      throw unprocessable('The store is closed right now. Schedule a pickup instead.', 'STORE_CLOSED');
    }
    const [address] = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, input.addressId!), eq(addresses.userId, userId)))
      .limit(1);
    if (!address) throw notFound('Delivery address');
    const distance = haversineKm(address, store);
    if (distance > settings.deliveryRadiusKm) {
      throw unprocessable(
        `This address is ${distance.toFixed(1)} km away; ${store.name} delivers within ${settings.deliveryRadiusKm} km.`,
        'OUT_OF_DELIVERY_AREA',
      );
    }
    addressSnapshot = {
      label: address.label,
      line1: address.line1,
      line2: address.line2,
      landmark: address.landmark,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      lat: address.lat,
      lng: address.lng,
      receiverName: address.receiverName,
      receiverPhone: address.receiverPhone,
    };
  } else {
    if (!store.supportsPickup) throw unprocessable('This store does not offer pickup', 'CHANNEL_UNAVAILABLE');
    const slots = await pickupSlots(db, store, 7);
    if (!isValidPickupSlot(slots, input.pickupSlotStart!)) {
      throw unprocessable('That pickup slot is no longer available. Please choose another.', 'SLOT_UNAVAILABLE');
    }
    scheduledFor = new Date(input.pickupSlotStart!);
    slotEnd = new Date(scheduledFor.getTime() + settings.pickupSlotMinutes * 60_000);
  }

  const customer = await customerContext(userId);
  const isCash = provider === 'cash';

  const { orderId, payment } = await transaction(async (tx, afterCommit) => {
    const priced = await priceCart(tx, input, userId);
    if (priced.unavailable.length > 0) {
      throw new AppError(409, 'INSUFFICIENT_STOCK', 'Some items are no longer available in the requested quantity', {
        unavailable: priced.unavailable,
      });
    }
    if (priced.bill.itemCount === 0) throw badRequest('Your cart is empty');
    const now = new Date();
    const orderNumber = await generateOrderNumber(tx);
    const status: OrderStatus = isCash ? 'PLACED' : 'PENDING_PAYMENT';
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        userId,
        storeId: store.id,
        channel: input.channel,
        status,
        paymentStatus: 'UNPAID',
        paymentMethod: input.paymentMethod,
        itemCount: priced.bill.itemCount,
        itemTotal: priced.bill.itemTotal,
        mrpTotal: priced.bill.mrpTotal,
        couponDiscount: priced.bill.couponDiscount,
        deliveryFee: priced.bill.deliveryFee,
        handlingFee: priced.bill.handlingFee,
        smallCartFee: priced.bill.smallCartFee,
        tip: priced.bill.tip,
        taxIncluded: priced.bill.taxIncluded,
        total: priced.bill.total,
        costTotal: priced.lines.reduce((sum, l) => sum + l.unitCost * l.quantity, 0),
        offerId: priced.offerId,
        couponCode: priced.offerId ? (priced.offer?.code ?? null) : null,
        address: addressSnapshot,
        scheduledFor,
        slotEnd,
        pickupCode: input.channel === 'PICKUP' ? randomCode(6) : null,
        notes: input.notes ?? null,
        deliveryEtaMinutes: input.channel === 'DELIVERY' ? settings.deliveryEtaMinutes : null,
        idempotencyKey: input.idempotencyKey ?? null,
        placedAt: isCash ? now : null,
      })
      .returning();
    await tx.insert(orderItems).values(
      priced.lines.map((l) => ({
        orderId: order!.id,
        productId: l.productId,
        categoryId: l.categoryId!,
        name: l.name,
        brand: l.brand,
        unit: l.unit,
        emoji: l.emoji,
        color: l.color,
        barcode: l.barcode,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        mrp: l.mrp,
        unitCost: l.unitCost,
        taxRate: l.taxRate,
        lineTotal: l.unitPrice * l.quantity,
        aisle: l.aisle,
        row: l.row,
        shelf: l.shelf,
      })),
    );
    await tx.insert(orderEvents).values({ orderId: order!.id, status, actorId: userId, actorName: customer.name });
    await reserveForOrder(
      tx,
      priced.lines.map((l) => ({ storeProductId: l.storeProductId, quantity: l.quantity })),
      order!.id,
      userId,
      afterCommit,
    );
    const [paymentRow] = await tx
      .insert(payments)
      .values({
        orderId: order!.id,
        userId,
        provider,
        method: input.paymentMethod,
        amount: priced.bill.total,
        savedPaymentMethodId: saved?.id ?? null,
      })
      .returning();
    if (isCash) await onOrderPlaced(tx, order!, afterCommit);
    return { orderId: order!.id, payment: paymentRow! };
  });

  const paymentInfo = await startProviderPayment(payment, {
    orderNumber: (await loadOrder(db, orderId))!.orderNumber,
    customer,
    stripePaymentMethodId: saved?.provider === 'stripe' ? saved.providerRef : null,
  });
  return { order: (await loadOrder(db, orderId))!, payment: paymentInfo };
}

/** Starts a new payment attempt for an order that is still awaiting payment. */
export async function retryPayment(
  userId: string,
  orderId: string,
  method: PaymentMethodType,
  savedPaymentMethodId?: string,
): Promise<CheckoutResult> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  if (!order) throw notFound('Order');
  if (order.status !== 'PENDING_PAYMENT') throw conflict('This order is not waiting for payment');
  assertMethodAllowed(method, order.channel);
  if (method === 'CASH_ON_DELIVERY') throw badRequest('Choose an online payment method');
  const provider = providerFor(method);
  const saved = await savedMethodFor(userId, savedPaymentMethodId, method);
  await db
    .update(payments)
    .set({ status: 'CANCELLED' })
    .where(and(eq(payments.orderId, orderId), inArray(payments.status, ['CREATED', 'REQUIRES_ACTION', 'PROCESSING'])));
  const [payment] = await db
    .insert(payments)
    .values({ orderId, userId, provider, method, amount: order.total, savedPaymentMethodId: saved?.id ?? null })
    .returning();
  await db.update(orders).set({ paymentMethod: method, paymentStatus: 'UNPAID' }).where(eq(orders.id, orderId));
  const info = await startProviderPayment(payment!, {
    orderNumber: order.orderNumber,
    customer: await customerContext(userId),
    stripePaymentMethodId: saved?.provider === 'stripe' ? saved.providerRef : null,
  });
  return { order: (await loadOrder(db, orderId))!, payment: info };
}

// ---------------------------------------------------------------------------
// Payment completion
// ---------------------------------------------------------------------------

/**
 * Applies a verified provider result. Idempotent: webhooks and the client's
 * confirm call may both arrive. Returns the plain exit-pass token for paid
 * in-store orders (shown once).
 */
export async function applyPaymentResult(
  paymentId: string,
  result: VerificationResult,
): Promise<{ orderId: string; exitToken: string | null; payment: PaymentRow }> {
  return transaction(async (tx, afterCommit) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update');
    if (!payment) throw notFound('Payment');
    if (payment.status === 'SUCCEEDED' || result.status === 'pending') {
      return { orderId: payment.orderId, exitToken: null, payment };
    }
    if (result.status === 'failed') {
      const [failed] = await tx
        .update(payments)
        .set({ status: 'FAILED', failureReason: result.reason })
        .where(eq(payments.id, payment.id))
        .returning();
      await tx
        .update(orders)
        .set({ paymentStatus: 'FAILED' })
        .where(and(eq(orders.id, payment.orderId), eq(orders.status, 'PENDING_PAYMENT')));
      afterCommit(() => broadcast.toOrder(payment.orderId, SocketEvents.ORDER_CHANGED, { orderId: payment.orderId }));
      return { orderId: payment.orderId, exitToken: null, payment: failed! };
    }

    const [paid] = await tx
      .update(payments)
      .set({ status: 'SUCCEEDED', providerPaymentId: result.providerPaymentId, succeededAt: new Date(), failureReason: null })
      .where(eq(payments.id, payment.id))
      .returning();
    const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for('update');
    if (!order) throw notFound('Order');

    if (order.status === 'CANCELLED') {
      // Paid after the order was cancelled (e.g. a slow wallet): refund right away.
      afterCommit(async () => {
        await refundWithProvider(paid!, paid!.amount);
        await db.update(payments).set({ status: 'REFUNDED', refundedAmount: paid!.amount }).where(eq(payments.id, paid!.id));
        await db.update(orders).set({ paymentStatus: 'REFUNDED' }).where(eq(orders.id, order.id));
      });
      return { orderId: order.id, exitToken: null, payment: paid! };
    }
    if (order.status !== 'PENDING_PAYMENT') return { orderId: order.id, exitToken: null, payment: paid! };

    const now = new Date();
    const inStore = order.channel === 'IN_STORE';
    const status: OrderStatus = inStore ? 'COMPLETED' : 'PLACED';
    const [updated] = await tx
      .update(orders)
      .set({ status, paymentStatus: 'PAID', placedAt: now, completedAt: inStore ? now : null })
      .where(eq(orders.id, order.id))
      .returning();
    await tx.insert(orderEvents).values({
      orderId: order.id,
      status,
      note: inStore ? 'Paid in the app (Scan & Go)' : `Paid with ${payment.method.replace('_', ' ').toLowerCase()}`,
    });

    let exitToken: string | null = null;
    if (inStore) {
      const store = await getStore(tx, order.storeId);
      const issued = await issueExitPass(tx, order, resolveSettings(store.settings).exitPassTtlMinutes);
      exitToken = issued.token;
      if (order.sessionId) {
        await tx.update(instoreSessions).set({ status: 'PAID', endedAt: now }).where(eq(instoreSessions.id, order.sessionId));
        afterCommit(() =>
          broadcast.toSession(order.sessionId!, SocketEvents.SESSION_UPDATED, { sessionId: order.sessionId, status: 'PAID' }),
        );
      }
    }
    await onOrderPlaced(tx, updated!, afterCommit);
    return { orderId: order.id, exitToken, payment: paid! };
  });
}

/** Bookkeeping when an order becomes a sale: offer redemption, loyalty points, notifications. */
async function onOrderPlaced(tx: Transaction, order: OrderRow, afterCommit: AfterCommit): Promise<void> {
  if (order.offerId) {
    // A free-delivery offer has no coupon discount; its value is the waived delivery fee.
    let discount = order.couponDiscount;
    if (discount === 0 && order.channel === 'DELIVERY' && order.deliveryFee === 0) {
      discount = resolveSettings((await getStore(tx, order.storeId)).settings).deliveryFee;
    }
    await tx
      .insert(offerRedemptions)
      .values({ offerId: order.offerId, orderId: order.id, userId: order.userId, storeId: order.storeId, discount })
      .onConflictDoNothing();
  }
  await tx
    .update(customerProfiles)
    .set({ loyaltyPoints: sql`${customerProfiles.loyaltyPoints} + ${Math.floor(order.total / 10000)}` })
    .where(eq(customerProfiles.userId, order.userId));

  const title =
    order.channel === 'IN_STORE'
      ? 'Payment received, you are good to go!'
      : order.channel === 'PICKUP'
        ? 'Pickup order confirmed'
        : 'Order placed';
  const body =
    order.channel === 'IN_STORE'
      ? 'Show your exit pass at the gate. Thank you for shopping with SmartCart.'
      : order.channel === 'PICKUP'
        ? `We will have it packed for your slot. Pickup code ${order.pickupCode}.`
        : `Arriving in about ${order.deliveryEtaMinutes ?? 10} minutes.`;
  await notifyUsers(tx, [order.userId], { type: 'ORDER_STATUS', title, body, data: { orderId: order.id } }, afterCommit);
  afterCommit(() => {
    broadcast.toStoreOps(order.storeId, SocketEvents.ORDER_CHANGED, { orderId: order.id, status: order.status, channel: order.channel });
    broadcast.toOrder(order.id, SocketEvents.ORDER_CHANGED, { orderId: order.id, status: order.status });
  });
}

// ---------------------------------------------------------------------------
// Cancellation & status changes
// ---------------------------------------------------------------------------

export async function cancelOrder(
  orderId: string,
  /** userId is null for system actions (e.g. unpaid orders released by the housekeeping job). */
  actor: { userId: string | null; name: string; isStaff: boolean },
  reason: string,
): Promise<Order> {
  await transaction(async (tx, afterCommit) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw notFound('Order');
    const customerCancellable: OrderStatus[] = ['PENDING_PAYMENT', 'PLACED'];
    const staffCancellable: OrderStatus[] = ['PENDING_PAYMENT', 'PLACED', 'PACKING', 'READY_FOR_PICKUP'];
    if (!(actor.isStaff ? staffCancellable : customerCancellable).includes(order.status)) {
      throw conflict(
        order.status === 'CANCELLED' ? 'This order is already cancelled' : 'This order is already being prepared and cannot be cancelled',
        'NOT_CANCELLABLE',
      );
    }
    await tx.update(orders).set({ status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason }).where(eq(orders.id, order.id));
    await tx
      .insert(orderEvents)
      .values({ orderId: order.id, status: 'CANCELLED', note: reason, actorId: actor.userId, actorName: actor.name });
    if (order.channel !== 'IN_STORE') {
      await releaseOrder(tx, order.id, actor.userId, afterCommit);
    } else if (order.sessionId) {
      await tx.update(instoreSessions).set({ status: 'ACTIVE', orderId: null }).where(eq(instoreSessions.id, order.sessionId));
    }
    await tx.delete(offerRedemptions).where(eq(offerRedemptions.orderId, order.id));

    const paidPayments = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.status, 'SUCCEEDED')));
    await tx
      .update(payments)
      .set({ status: 'CANCELLED' })
      .where(and(eq(payments.orderId, order.id), inArray(payments.status, ['CREATED', 'REQUIRES_ACTION', 'PROCESSING'])));
    if (paidPayments.length > 0) {
      await tx.update(orders).set({ paymentStatus: 'REFUNDED' }).where(eq(orders.id, order.id));
      for (const payment of paidPayments) {
        await tx.update(payments).set({ status: 'REFUNDED', refundedAmount: payment.amount }).where(eq(payments.id, payment.id));
        afterCommit(async () => {
          try {
            await refundWithProvider(payment, payment.amount);
          } catch (error) {
            logger.error({ err: error, paymentId: payment.id }, 'Refund failed; needs manual follow-up');
          }
        });
      }
    }
    await notifyUsers(
      tx,
      [order.userId],
      {
        type: 'ORDER_STATUS',
        title: `Order ${order.orderNumber} cancelled`,
        body: paidPayments.length > 0 ? 'Your refund has been initiated and will reach you in 3-5 days.' : reason,
        data: { orderId: order.id },
      },
      afterCommit,
    );
    afterCommit(() => {
      broadcast.toStoreOps(order.storeId, SocketEvents.ORDER_CHANGED, { orderId: order.id, status: 'CANCELLED' });
      broadcast.toOrder(order.id, SocketEvents.ORDER_CHANGED, { orderId: order.id, status: 'CANCELLED' });
    });
  });
  return (await loadOrder(db, orderId))!;
}

const STATUS_MESSAGES: Partial<Record<OrderStatus, (o: OrderRow) => string>> = {
  PACKING: () => 'Your items are being packed.',
  OUT_FOR_DELIVERY: (o) => `${o.riderName ?? 'Your delivery partner'} is on the way.`,
  DELIVERED: () => 'Delivered. Enjoy your groceries!',
  READY_FOR_PICKUP: (o) => `Ready at the pickup counter. Show code ${o.pickupCode}.`,
  PICKED_UP: () => 'Picked up. Thank you for shopping with SmartCart!',
};

export async function updateOrderStatus(
  orderId: string,
  storeId: string,
  staff: { userId: string; employeeId: string; name: string },
  input: { status: OrderStatus; note?: string; pickupCode?: string; riderName?: string; riderPhone?: string },
): Promise<Order> {
  if (input.status === 'CANCELLED') {
    return cancelOrder(orderId, { userId: staff.userId, name: staff.name, isStaff: true }, input.note ?? 'Cancelled by the store');
  }
  await transaction(async (tx, afterCommit) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.storeId, storeId)))
      .for('update');
    if (!order) throw notFound('Order');
    const allowed = ORDER_STAFF_TRANSITIONS[order.channel][order.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw conflict(
        `Cannot move an order from "${ORDER_STATUS_LABELS[order.status]}" to "${ORDER_STATUS_LABELS[input.status]}"`,
        'INVALID_TRANSITION',
      );
    }
    if (input.status === 'PICKED_UP' && (input.pickupCode ?? '').toUpperCase() !== order.pickupCode) {
      throw new AppError(400, 'PICKUP_CODE_MISMATCH', 'The pickup code does not match this order');
    }
    const now = new Date();
    const patch: Partial<typeof orders.$inferInsert> = { status: input.status };
    if (input.status === 'PACKING') {
      patch.packingAt = now;
      if (!order.pickerId) patch.pickerId = staff.employeeId;
    }
    if (input.status === 'READY_FOR_PICKUP') patch.readyAt = now;
    if (input.status === 'OUT_FOR_DELIVERY') {
      patch.outForDeliveryAt = now;
      patch.riderName = input.riderName ?? order.riderName ?? staff.name;
      patch.riderPhone = input.riderPhone ?? order.riderPhone ?? null;
    }
    if (input.status === 'DELIVERED' || input.status === 'PICKED_UP') {
      patch.completedAt = now;
      if (order.paymentMethod === 'CASH_ON_DELIVERY') {
        patch.paymentStatus = 'PAID';
        await tx
          .update(payments)
          .set({ status: 'SUCCEEDED', succeededAt: now })
          .where(and(eq(payments.orderId, order.id), eq(payments.provider, 'cash')));
      }
    }
    const [updated] = await tx.update(orders).set(patch).where(eq(orders.id, order.id)).returning();
    await tx
      .insert(orderEvents)
      .values({ orderId: order.id, status: input.status, note: input.note ?? null, actorId: staff.userId, actorName: staff.name });
    const message = STATUS_MESSAGES[input.status]?.(updated!);
    if (message) {
      await notifyUsers(
        tx,
        [order.userId],
        { type: 'ORDER_STATUS', title: ORDER_STATUS_LABELS[input.status], body: message, data: { orderId: order.id } },
        afterCommit,
      );
    }
    afterCommit(() => {
      broadcast.toStoreOps(storeId, SocketEvents.ORDER_CHANGED, { orderId: order.id, status: input.status });
      broadcast.toOrder(order.id, SocketEvents.ORDER_CHANGED, { orderId: order.id, status: input.status });
      broadcast.toUser(order.userId, SocketEvents.ORDER_CHANGED, { orderId: order.id, status: input.status });
    });
  });
  return (await loadOrder(db, orderId))!;
}

/** Customer purchase history across all channels. */
export async function listCustomerOrders(userId: string, channel: OrderChannel | undefined, limit: number, offset: number) {
  const where = and(eq(orders.userId, userId), channel ? eq(orders.channel, channel) : undefined);
  const [{ total }] = (await db.select({ total: count() }).from(orders).where(where)) as [{ total: number }];
  const rows = await db.query.orders.findMany({
    where,
    with: { items: { columns: { emoji: true } }, store: { columns: { name: true } } },
    orderBy: (o, { desc }) => [desc(o.createdAt)],
    limit,
    offset,
  });
  const items: OrderSummary[] = rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    channel: row.channel,
    status: row.status,
    paymentStatus: row.paymentStatus,
    paymentMethod: row.paymentMethod,
    storeId: row.storeId,
    storeName: row.store.name,
    total: row.total,
    itemCount: row.itemCount,
    previewEmojis: row.items.slice(0, 4).map((i) => i.emoji),
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    placedAt: row.placedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
  return { items, total, limit, offset };
}

export async function getCustomerOrder(userId: string, orderId: string): Promise<Order> {
  const order = await loadOrder(db, orderId);
  if (!order) throw notFound('Order');
  if (order.customer?.id !== userId) throw forbidden('This is not your order');
  return order;
}
