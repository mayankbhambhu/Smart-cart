import type { StoreSettings } from '@smartcart/shared';

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  deliveryFee: 3000,
  freeDeliveryThreshold: 19900,
  handlingFee: 400,
  smallCartThreshold: 9900,
  smallCartFee: 2000,
  deliveryEtaMinutes: 10,
  deliveryRadiusKm: 5,
  pickupSlotMinutes: 30,
  pickupSlotCapacity: 12,
  pickupLeadMinutes: 30,
  exitPassTtlMinutes: 60,
  sessionIdleMinutes: 120,
  autoCreateRestockTasks: true,
  geofenceMeters: 300,
};

/** Fills in settings added after a store was created. */
export function resolveSettings(settings: Partial<StoreSettings> | null | undefined): StoreSettings {
  return { ...DEFAULT_STORE_SETTINGS, ...(settings ?? {}) };
}
