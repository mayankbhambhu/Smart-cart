import {
  computeBill,
  type OfferRule,
  type OrderChannel,
  type PaymentMethodType,
  type PricingLine,
  type StoreFees,
} from '@smartcart/shared';
import { sha256 } from '../../lib/crypto';
import { addDays, zonedParts, zonedToUtc } from '../../lib/time';
import { db } from '../client';
import { exitPasses, gateEvents, offerRedemptions, orderEvents, orderItems, orders, payments } from '../schema';
import { chunk, type Random } from './random';

/**
 * Generates months of realistic order history: weekday/weekend seasonality,
 * morning and evening rush hours, channel mix, basket affinities, offer
 * usage and payment preferences, so every analytics view has signal.
 */

export interface HistoryProduct {
  id: string;
  storeProductId: string;
  name: string;
  /** catalogue name without the brand, used for basket affinities */
  shortName: string;
  brand: string;
  unit: string;
  emoji: string;
  color: string;
  barcode: string;
  categoryId: string;
  categorySlug: string;
  price: number;
  mrp: number;
  cost: number;
  taxRate: number;
  aisle: number;
  row: number;
  shelf: number;
  weight: number;
}

export interface HistoryCustomer {
  id: string;
  name: string;
  phone: string;
  weight: number;
  address: {
    label: 'HOME' | 'WORK' | 'OTHER';
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    pincode: string;
    lat: number;
    lng: number;
    receiverName: string | null;
    receiverPhone: string | null;
  };
}

export interface HistoryStore {
  id: string;
  code: string;
  name: string;
  timezone: string;
  baseDailyOrders: number;
  fees: StoreFees;
  products: HistoryProduct[];
  customers: HistoryCustomer[];
  categoryWeights: Map<string, number>;
  gateDeviceIds: string[];
}

export interface HistoryOffer extends OfferRule {
  storeId: string | null;
}

const HOURLY: Record<OrderChannel, number[]> = {
  //          0  1  2  3  4  5  6  7  8   9   10 11 12 13 14 15 16 17  18  19  20  21  22 23
  DELIVERY: [0, 0, 0, 0, 0, 0, 1, 6, 9, 8, 5, 4, 5, 5, 4, 3, 4, 5, 7, 10, 11, 10, 6, 2],
  PICKUP: [0, 0, 0, 0, 0, 0, 0, 2, 5, 6, 6, 5, 5, 4, 4, 4, 5, 8, 10, 9, 6, 3, 1, 0],
  IN_STORE: [0, 0, 0, 0, 0, 0, 0, 3, 5, 6, 6, 6, 7, 6, 5, 5, 6, 9, 12, 13, 11, 8, 4, 0],
};

const PAYMENT_MIX: Record<OrderChannel, [PaymentMethodType, number][]> = {
  DELIVERY: [
    ['UPI', 48],
    ['CARD', 12],
    ['GOOGLE_PAY', 10],
    ['APPLE_PAY', 5],
    ['PAYPAL', 3],
    ['CASH_ON_DELIVERY', 22],
  ],
  PICKUP: [
    ['UPI', 55],
    ['CARD', 20],
    ['GOOGLE_PAY', 12],
    ['APPLE_PAY', 8],
    ['PAYPAL', 5],
  ],
  IN_STORE: [
    ['UPI', 52],
    ['GOOGLE_PAY', 16],
    ['APPLE_PAY', 13],
    ['CARD', 16],
    ['PAYPAL', 3],
  ],
};

/** [channel, minutes ago] of the in-progress orders created relative to "now". */
const LIVE_ORDERS: [OrderChannel, number][] = [
  ['DELIVERY', 1],
  ['DELIVERY', 2],
  ['DELIVERY', 4],
  ['DELIVERY', 5],
  ['DELIVERY', 8],
  ['PICKUP', 3],
  ['PICKUP', 12],
  ['PICKUP', 25],
  ['IN_STORE', 2],
  ['IN_STORE', 4],
];

const AFFINITIES: Record<string, string[]> = {
  'Brown Bread': ['Salted Butter', 'Farm Fresh Eggs', 'Mixed Fruit Jam'],
  'White Sandwich Bread': ['Salted Butter', 'Cheese Slices', 'Farm Fresh Eggs'],
  'Classic Salted Chips': ['Coca-Cola', 'Thums Up'],
  'Magic Masala Chips': ['Coca-Cola', 'Sprite'],
  'Masala Noodles': ['Tomato Ketchup', 'Onion'],
  'Pav Buns': ['Salted Butter', 'Potato', 'Onion'],
  'Tata Tea Gold': ['Parle-G Original', 'Gold Full Cream Milk'],
  'Chicken Curry Cut': ['Onion', 'Tomato Hybrid', 'Kitchen King Masala'],
  'Nacho Chips Cheese': ['Coca-Cola', 'Tomato Ketchup'],
  'Rolled Oats': ['Banana Robusta', 'Almond Milk Unsweetened'],
  'Fresh Paneer': ['Tomato Hybrid', 'Onion', 'Kitchen King Masala'],
};

export interface GeneratedHistory {
  orders: number;
  items: number;
}

export async function seedOrderHistory(
  rng: Random,
  stores: HistoryStore[],
  offers: HistoryOffer[],
  days: number,
  now: Date,
): Promise<GeneratedHistory> {
  let orderCount = 0;
  let itemCount = 0;

  for (const store of stores) {
    const byName = new Map(store.products.map((p) => [p.shortName, p]));
    const byId = new Map(store.products.map((p) => [p.id, p]));
    const productsByCategory = new Map<string, HistoryProduct[]>();
    for (const product of store.products) {
      productsByCategory.set(product.categoryId, [...(productsByCategory.get(product.categoryId) ?? []), product]);
    }
    const categoryIds = [...productsByCategory.keys()];
    const storeOffers = offers.filter((o) => o.storeId === null || o.storeId === store.id);
    const offerByCode = new Map(storeOffers.map((o) => [o.code ?? o.id, o]));
    const customersWithOrders = new Set<string>();
    const today = zonedParts(now, store.timezone).date;
    const firstDay = addDays(today, -days);
    const spikeDay = addDays(today, -19);

    const orderRows: (typeof orders.$inferInsert)[] = [];
    const itemRows: (typeof orderItems.$inferInsert)[] = [];
    const eventRows: (typeof orderEvents.$inferInsert)[] = [];
    const paymentRows: (typeof payments.$inferInsert)[] = [];
    const redemptionRows: (typeof offerRedemptions.$inferInsert)[] = [];
    const passRows: (typeof exitPasses.$inferInsert)[] = [];
    const gateRows: (typeof gateEvents.$inferInsert)[] = [];

    const slots: { date: string; weekend: boolean; channel: OrderChannel; placedAt: Date }[] = [];
    for (let dayIndex = 0; dayIndex <= days; dayIndex++) {
      const date = addDays(firstDay, dayIndex);
      const dow = zonedParts(zonedToUtc(date, '12:00', store.timezone), store.timezone).dow;
      const weekend = dow === 0 || dow === 6;
      const growth = 1 + 0.0028 * dayIndex;
      const seasonal = weekend ? 1.32 : dow === 5 ? 1.1 : 1;
      const spike = date === spikeDay ? 1.9 : 1;
      const target = Math.round(store.baseDailyOrders * growth * seasonal * spike * (0.85 + rng.next() * 0.3));

      for (let n = 0; n < target; n++) {
        const channel: OrderChannel = rng.weighted(
          [
            ['DELIVERY', 55],
            ['PICKUP', 15],
            ['IN_STORE', weekend ? 36 : 28],
          ] as const,
          (c) => c[1],
        )[0];
        const hour = rng.weighted(
          HOURLY[channel].map((weight, h) => ({ h, weight })),
          (x) => x.weight,
        ).h;
        const minute = rng.int(0, 59);
        const placedAt = new Date(zonedToUtc(date, `${pad(hour)}:${pad(minute)}`, store.timezone).getTime() + rng.int(0, 59) * 1000);
        if (placedAt <= now) slots.push({ date, weekend, channel, placedAt });
      }
    }
    // A few orders from the last half hour so the live boards always have work in progress.
    const todayDow = zonedParts(now, store.timezone).dow;
    for (const [channel, minutesAgo] of LIVE_ORDERS) {
      slots.push({ date: today, weekend: todayDow === 0 || todayDow === 6, channel, placedAt: new Date(now.getTime() - minutesAgo * 60_000) });
    }
    slots.sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());

    for (const { date, weekend, channel, placedAt } of slots) {

      const customer = rng.weighted(store.customers, (c) => c.weight);
      const isFirstOrder = !customersWithOrders.has(customer.id);
      customersWithOrders.add(customer.id);

      // Basket
      const basket = new Map<string, number>();
      const distinct = Math.min(14, 1 + Math.floor(-Math.log(Math.max(rng.next(), 1e-6)) * (channel === 'IN_STORE' ? 5 : 3.6)));
      while (basket.size < distinct) {
        const categoryId = rng.weighted(categoryIds, (id) => store.categoryWeights.get(id) ?? 1);
        const product = rng.weighted(productsByCategory.get(categoryId)!, (p) => p.weight);
        const qty = rng.weighted([1, 1, 1, 1, 1, 1, 1, 2, 2, 3], () => 1);
        basket.set(product.id, Math.min(6, (basket.get(product.id) ?? 0) + qty));
        for (const companion of AFFINITIES[product.shortName] ?? []) {
          const match = byName.get(companion);
          if (match && rng.chance(0.35)) basket.set(match.id, basket.get(match.id) ?? 1);
        }
      }
      const chosen = [...basket.entries()].map(([id, quantity]) => ({
        product: byId.get(id)!,
        quantity,
      }));
      const lines: PricingLine[] = chosen.map(({ product, quantity }) => ({
        productId: product.id,
        categoryId: product.categoryId,
        quantity,
        unitPrice: product.price,
        mrp: product.mrp,
        taxRate: product.taxRate,
      }));
      const itemTotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

      // Offer preference
      let offer: HistoryOffer | undefined;
      const has = (slug: string) => chosen.some((c) => c.product.categorySlug === slug);
      if (isFirstOrder && itemTotal >= 19900 && rng.chance(0.75)) offer = offerByCode.get('WELCOME50');
      else if (channel === 'IN_STORE' && rng.chance(0.3)) offer = offerByCode.get('SCANGO10');
      else if (weekend && itemTotal >= 99900 && rng.chance(0.55)) offer = offerByCode.get('WEEKEND15');
      else if (has('fruits-vegetables') && rng.chance(0.24)) offer = offerByCode.get('FRESH20');
      else if (channel === 'DELIVERY' && itemTotal < 19900 && rng.chance(0.18)) offer = offerByCode.get('FREEDEL');
      else if (store.code === 'MUM-BAN-01' && itemTotal >= 29900 && rng.chance(0.12)) offer = offerByCode.get('BANDRA25');
      const tip = channel === 'DELIVERY' && rng.chance(0.12) ? rng.pick([1000, 2000, 3000]) : 0;
      let { bill, offer: evaluation } = computeBill({ lines, channel, fees: store.fees, offer: offer ?? null, tip });
      if (offer && !evaluation?.applicable) {
        offer = undefined;
        ({ bill, offer: evaluation } = computeBill({ lines, channel, fees: store.fees, tip }));
      }

      const paymentMethod = rng.weighted(PAYMENT_MIX[channel], (m) => m[1])[0];
      const cancelled = channel !== 'IN_STORE' && rng.chance(0.025);
      const orderId = crypto.randomUUID();
      const orderNumber = `SC${rng.code(8)}`;
      const isToday = date === today;
      const minutesAgo = (now.getTime() - placedAt.getTime()) / 60_000;

      let status: (typeof orders.$inferInsert)['status'];
      let completedAt: Date | null = null;
      let scheduledFor: Date | null = null;
      let slotEnd: Date | null = null;
      let packingAt: Date | null = null;
      let readyAt: Date | null = null;
      let outForDeliveryAt: Date | null = null;

      if (channel === 'DELIVERY') {
        const deliveredAfter = rng.int(8, 19);
        packingAt = new Date(placedAt.getTime() + 60_000);
        outForDeliveryAt = new Date(placedAt.getTime() + rng.int(3, 6) * 60_000);
        if (isToday && minutesAgo < 3) {
          status = 'PLACED';
          packingAt = null;
          outForDeliveryAt = null;
        } else if (isToday && minutesAgo < 6) {
          status = 'PACKING';
          outForDeliveryAt = null;
        } else if (isToday && minutesAgo < deliveredAfter) {
          status = 'OUT_FOR_DELIVERY';
        } else {
          status = 'DELIVERED';
          completedAt = new Date(placedAt.getTime() + deliveredAfter * 60_000);
        }
      } else if (channel === 'PICKUP') {
        const slotStart = Math.ceil((placedAt.getTime() + rng.int(60, 240) * 60_000) / 1_800_000) * 1_800_000;
        scheduledFor = new Date(slotStart);
        slotEnd = new Date(slotStart + 30 * 60_000);
        const untilSlot = (scheduledFor.getTime() - now.getTime()) / 60_000;
        if (untilSlot > 45) status = 'PLACED';
        else if (untilSlot > 10) {
          status = 'PACKING';
          packingAt = new Date(scheduledFor.getTime() - 40 * 60_000);
        } else if (untilSlot > -20) {
          status = 'READY_FOR_PICKUP';
          packingAt = new Date(scheduledFor.getTime() - 40 * 60_000);
          readyAt = new Date(scheduledFor.getTime() - 15 * 60_000);
        } else {
          status = 'PICKED_UP';
          packingAt = new Date(scheduledFor.getTime() - 40 * 60_000);
          readyAt = new Date(scheduledFor.getTime() - 15 * 60_000);
          completedAt = new Date(scheduledFor.getTime() + rng.int(0, 25) * 60_000);
        }
      } else {
        status = 'COMPLETED';
        completedAt = placedAt;
      }
      // Only orders that would otherwise have completed get cancelled, so live orders stay live.
      const finalCancelled = cancelled && (status === 'DELIVERED' || status === 'PICKED_UP');
      if (finalCancelled) {
        status = 'CANCELLED';
        completedAt = null;
      }

      const costTotal = chosen.reduce((sum, c) => sum + c.product.cost * c.quantity, 0);
      orderRows.push({
        id: orderId,
        orderNumber,
        userId: customer.id,
        storeId: store.id,
        channel,
        status,
        paymentStatus: finalCancelled
          ? paymentMethod === 'CASH_ON_DELIVERY'
            ? 'UNPAID'
            : 'REFUNDED'
          : paymentMethod === 'CASH_ON_DELIVERY' && status !== 'DELIVERED'
            ? 'UNPAID'
            : 'PAID',
        paymentMethod,
        itemCount: bill.itemCount,
        itemTotal: bill.itemTotal,
        mrpTotal: bill.mrpTotal,
        couponDiscount: bill.couponDiscount,
        deliveryFee: bill.deliveryFee,
        handlingFee: bill.handlingFee,
        smallCartFee: bill.smallCartFee,
        tip: bill.tip,
        taxIncluded: bill.taxIncluded,
        total: bill.total,
        costTotal,
        offerId: offer?.id ?? null,
        couponCode: offer?.code ?? null,
        address: channel === 'DELIVERY' ? customer.address : null,
        scheduledFor,
        slotEnd,
        pickupCode: channel === 'PICKUP' ? rng.code(6) : null,
        riderName: channel === 'DELIVERY' && outForDeliveryAt ? rng.pick(['Ravi', 'Salman', 'Deepak', 'Arun', 'Mahesh']) : null,
        riderPhone: channel === 'DELIVERY' && outForDeliveryAt ? `+9198${rng.int(10000000, 99999999)}` : null,
        deliveryEtaMinutes: channel === 'DELIVERY' ? 10 : null,
        placedAt,
        packingAt,
        readyAt,
        outForDeliveryAt,
        completedAt,
        cancelledAt: finalCancelled ? new Date(placedAt.getTime() + 4 * 60_000) : null,
        cancelReason: finalCancelled ? rng.pick(['Customer requested cancellation', 'Address not serviceable', 'Item unavailable']) : null,
        createdAt: placedAt,
        updatedAt: completedAt ?? placedAt,
      });

      for (const { product, quantity } of chosen) {
        itemRows.push({
          orderId,
          productId: product.id,
          categoryId: product.categoryId,
          name: product.name,
          brand: product.brand,
          unit: product.unit,
          emoji: product.emoji,
          color: product.color,
          barcode: product.barcode,
          quantity,
          unitPrice: product.price,
          mrp: product.mrp,
          unitCost: product.cost,
          taxRate: product.taxRate,
          lineTotal: product.price * quantity,
          aisle: product.aisle,
          row: product.row,
          shelf: product.shelf,
        });
      }

      eventRows.push({ orderId, status: 'PLACED', createdAt: placedAt });
      if (packingAt) eventRows.push({ orderId, status: 'PACKING', createdAt: packingAt });
      if (readyAt) eventRows.push({ orderId, status: 'READY_FOR_PICKUP', createdAt: readyAt });
      if (outForDeliveryAt) eventRows.push({ orderId, status: 'OUT_FOR_DELIVERY', createdAt: outForDeliveryAt });
      if (completedAt && status !== 'COMPLETED') eventRows.push({ orderId, status, createdAt: completedAt });
      if (status === 'COMPLETED') eventRows.push({ orderId, status, note: 'Paid in app (Scan & Go)', createdAt: placedAt });
      if (finalCancelled) eventRows.push({ orderId, status: 'CANCELLED', createdAt: new Date(placedAt.getTime() + 4 * 60_000) });

      const cash = paymentMethod === 'CASH_ON_DELIVERY';
      paymentRows.push({
        orderId,
        userId: customer.id,
        provider: cash ? 'cash' : 'demo',
        method: paymentMethod,
        amount: bill.total,
        status: finalCancelled ? (cash ? 'CANCELLED' : 'REFUNDED') : cash && status !== 'DELIVERED' ? 'CREATED' : 'SUCCEEDED',
        providerRef: cash ? null : `demo_${orderNumber}`,
        refundedAmount: finalCancelled && !cash ? bill.total : 0,
        succeededAt: cash ? (status === 'DELIVERED' ? completedAt : null) : placedAt,
        createdAt: placedAt,
      });

      if (offer && evaluation?.applicable && !finalCancelled) {
        redemptionRows.push({
          offerId: offer.id,
          orderId,
          userId: customer.id,
          storeId: store.id,
          discount: bill.couponDiscount,
          createdAt: placedAt,
        });
      }

      if (channel === 'IN_STORE') {
        const exited = !(isToday && minutesAgo < 6);
        const passId = crypto.randomUUID();
        const gateId = rng.pick(store.gateDeviceIds);
        const usedAt = exited ? new Date(placedAt.getTime() + rng.int(1, 4) * 60_000) : null;
        passRows.push({
          id: passId,
          orderId,
          storeId: store.id,
          userId: customer.id,
          tokenHash: sha256(`seed-pass-${orderId}`),
          tokenHint: orderNumber.slice(-4),
          status: exited ? 'USED' : 'ACTIVE',
          expiresAt: new Date(placedAt.getTime() + 60 * 60_000),
          usedAt,
          usedAtDeviceId: exited ? gateId : null,
          issuedAt: placedAt,
        });
        if (exited && minutesAgo < 3 * 24 * 60) {
          gateRows.push({ storeId: store.id, deviceId: gateId, exitPassId: passId, orderId, result: 'OPENED', reason: 'OK', createdAt: usedAt! });
          if (rng.chance(0.03)) {
            gateRows.push({
              storeId: store.id,
              deviceId: gateId,
              exitPassId: passId,
              orderId,
              result: 'DENIED',
              reason: 'ALREADY_USED',
              createdAt: new Date(usedAt!.getTime() + 40_000),
            });
          }
        }
      }
    }

    for (const rows of chunk(orderRows, 800)) await db.insert(orders).values(rows);
    for (const rows of chunk(itemRows, 2000)) await db.insert(orderItems).values(rows);
    for (const rows of chunk(eventRows, 4000)) await db.insert(orderEvents).values(rows);
    for (const rows of chunk(paymentRows, 2000)) await db.insert(payments).values(rows);
    for (const rows of chunk(redemptionRows, 3000)) await db.insert(offerRedemptions).values(rows);
    for (const rows of chunk(passRows, 2000)) await db.insert(exitPasses).values(rows);
    for (const rows of chunk(gateRows, 3000)) await db.insert(gateEvents).values(rows);
    orderCount += orderRows.length;
    itemCount += itemRows.length;
  }

  return { orders: orderCount, items: itemCount };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
