import {
  haversineKm,
  type PickupSlotDay,
  type StoreDetail,
  type StoreFeesInfo,
  type StoreSettings,
  type StoreSummary,
} from '@smartcart/shared';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { orders, stores } from '../db/schema';
import { notFound } from '../lib/errors';
import { addDays, isOpenAt, minutesOfDay, zonedParts, zonedToUtc } from '../lib/time';
import { resolveSettings } from '../modules/stores/settings';

export type StoreRow = typeof stores.$inferSelect;

export function storeFees(settings: StoreSettings): StoreFeesInfo {
  return {
    deliveryFee: settings.deliveryFee,
    freeDeliveryThreshold: settings.freeDeliveryThreshold,
    handlingFee: settings.handlingFee,
    smallCartThreshold: settings.smallCartThreshold,
    smallCartFee: settings.smallCartFee,
  };
}

export function serializeStore(store: StoreRow, origin?: { lat: number; lng: number } | null, now = new Date()): StoreSummary {
  const settings = resolveSettings(store.settings);
  return {
    id: store.id,
    code: store.code,
    name: store.name,
    addressLine: store.addressLine,
    city: store.city,
    state: store.state,
    pincode: store.pincode,
    lat: store.lat,
    lng: store.lng,
    phone: store.phone,
    openingTime: store.openingTime,
    closingTime: store.closingTime,
    timezone: store.timezone,
    isOpenNow: store.status === 'ACTIVE' && isOpenAt(now, store.timezone, store.openingTime, store.closingTime),
    status: store.status,
    supportsDelivery: store.supportsDelivery,
    supportsPickup: store.supportsPickup,
    supportsInStore: store.supportsInStore,
    deliveryEtaMinutes: settings.deliveryEtaMinutes,
    deliveryRadiusKm: settings.deliveryRadiusKm,
    distanceKm: origin ? Math.round(haversineKm(origin, store) * 10) / 10 : null,
  };
}

export function serializeStoreDetail(store: StoreRow, origin?: { lat: number; lng: number } | null): StoreDetail {
  return {
    ...serializeStore(store, origin),
    email: store.email,
    layout: store.layout,
    fees: storeFees(resolveSettings(store.settings)),
  };
}

export async function getStore(executor: Executor, storeId: string): Promise<StoreRow> {
  const [store] = await executor.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) throw notFound('Store');
  return store;
}

/**
 * Pickup slots for the next few days. Slots start at least `pickupLeadMinutes`
 * from now and are limited by the per-slot capacity. 24x7 stores run the
 * pickup counter between 07:00 and 23:00.
 */
export async function pickupSlots(executor: Executor, store: StoreRow, days: number, now = new Date()): Promise<PickupSlotDay[]> {
  const settings = resolveSettings(store.settings);
  const slotMinutes = settings.pickupSlotMinutes;
  const allDay = store.openingTime === store.closingTime;
  const opening = allDay ? '07:00' : store.openingTime;
  const closing = allDay ? '23:00' : store.closingTime;
  const today = zonedParts(now, store.timezone).date;
  const earliest = now.getTime() + settings.pickupLeadMinutes * 60_000;

  const rangeStart = zonedToUtc(today, '00:00', store.timezone);
  const rangeEnd = zonedToUtc(addDays(today, days), '00:00', store.timezone);
  const booked = await executor
    .select({ slot: orders.scheduledFor, count: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, store.id),
        eq(orders.channel, 'PICKUP'),
        gte(orders.scheduledFor, rangeStart),
        lt(orders.scheduledFor, rangeEnd),
        sql`${orders.status} not in ('CANCELLED', 'PENDING_PAYMENT')`,
      ),
    )
    .groupBy(orders.scheduledFor);
  const bookedBySlot = new Map(booked.map((b) => [b.slot!.getTime(), b.count]));

  const result: PickupSlotDay[] = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(today, d);
    const openMinutes = minutesOfDay(opening);
    let closeMinutes = minutesOfDay(closing);
    if (closeMinutes <= openMinutes) closeMinutes += 24 * 60;
    const slots: PickupSlotDay['slots'] = [];
    for (let m = openMinutes; m + slotMinutes <= closeMinutes; m += slotMinutes) {
      const start = new Date(zonedToUtc(date, '00:00', store.timezone).getTime() + m * 60_000);
      if (start.getTime() < earliest) continue;
      const end = new Date(start.getTime() + slotMinutes * 60_000);
      const remaining = Math.max(0, settings.pickupSlotCapacity - (bookedBySlot.get(start.getTime()) ?? 0));
      slots.push({ start: start.toISOString(), end: end.toISOString(), remaining, available: remaining > 0 });
    }
    const label =
      d === 0
        ? 'Today'
        : d === 1
          ? 'Tomorrow'
          : new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    if (slots.length > 0) result.push({ date, label, slots });
  }
  return result;
}

export function isValidPickupSlot(days: PickupSlotDay[], slotStart: string): boolean {
  const target = new Date(slotStart).getTime();
  return days.some((day) => day.slots.some((slot) => new Date(slot.start).getTime() === target && slot.available));
}
