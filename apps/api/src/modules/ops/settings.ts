import {
  CreateDeviceSchema,
  IdSchema,
  OfferSchema,
  UpdateLayoutSchema,
  UpdateStoreSchema,
  generateLayout,
  type Device,
  type DeviceWithKey,
  type Offer,
} from '@smartcart/shared';
import { and, asc, count, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { devices, offerRedemptions, offers, storeProducts, stores } from '../../db/schema';
import { audit } from '../../lib/audit';
import { randomToken, sha256 } from '../../lib/crypto';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { allowRoles } from '../../middleware/auth';
import { getStore, serializeStoreDetail } from '../../services/stores';
import { resolveSettings } from '../stores/settings';

export const opsSettingsRouter = Router({ mergeParams: true });
const leadership = allowRoles('OWNER', 'STORE_MANAGER');

// --- Store profile & operating settings ---------------------------------------------------

opsSettingsRouter.get('/settings', async (req, res) => {
  const store = await getStore(db, req.staff!.storeId);
  res.json({ ...serializeStoreDetail(store), settings: resolveSettings(store.settings) });
});

opsSettingsRouter.patch('/settings', leadership, async (req, res) => {
  const input = parse(UpdateStoreSchema, req.body);
  const store = await getStore(db, req.staff!.storeId);
  const { settings, ...profile } = input;
  await db
    .update(stores)
    .set({ ...profile, ...(settings ? { settings: { ...resolveSettings(store.settings), ...settings } } : {}) })
    .where(eq(stores.id, store.id));
  await audit(db, {
    actorId: req.auth!.userId,
    actorKind: 'STAFF',
    actorName: req.staff!.name,
    action: 'STORE_SETTINGS_UPDATED',
    entityType: 'store',
    entityId: store.id,
    storeId: store.id,
    metadata: input as Record<string, unknown>,
    ip: req.ip,
  });
  const updated = await getStore(db, store.id);
  res.json({ ...serializeStoreDetail(updated), settings: resolveSettings(updated.settings) });
});

/** Rebuilds the floor plan; products in removed aisles move to the last aisle. */
opsSettingsRouter.put('/layout', allowRoles('OWNER'), async (req, res) => {
  const input = parse(UpdateLayoutSchema, req.body);
  const layout = generateLayout({ aisles: input.aisles, rows: input.rows, shelves: input.shelves });
  const storeId = req.staff!.storeId;
  await db.transaction(async (tx) => {
    await tx.update(stores).set({ layout }).where(eq(stores.id, storeId));
    const placed = await tx.select().from(storeProducts).where(eq(storeProducts.storeId, storeId));
    for (const sp of placed) {
      const aisle = Math.min(sp.aisle, layout.aisles.length);
      const row = Math.min(sp.row, input.rows);
      const shelf = Math.min(sp.shelf, input.shelves);
      if (aisle !== sp.aisle || row !== sp.row || shelf !== sp.shelf) {
        await tx.update(storeProducts).set({ aisle, row, shelf }).where(eq(storeProducts.id, sp.id));
      }
    }
  });
  res.json(serializeStoreDetail(await getStore(db, storeId)));
});

// --- Offers ---------------------------------------------------------------------------------

async function serializeOffers(rows: (typeof offers.$inferSelect)[]): Promise<Offer[]> {
  const counts = rows.length
    ? await db.select({ offerId: offerRedemptions.offerId, n: count() }).from(offerRedemptions).groupBy(offerRedemptions.offerId)
    : [];
  const byOffer = new Map(counts.map((c) => [c.offerId, c.n]));
  return rows.map((o) => ({
    id: o.id,
    storeId: o.storeId,
    code: o.code,
    title: o.title,
    description: o.description,
    type: o.type,
    value: o.value,
    minOrderValue: o.minOrderValue,
    maxDiscount: o.maxDiscount,
    productId: o.productId,
    categoryId: o.categoryId,
    buyQty: o.buyQty,
    getQty: o.getQty,
    channels: o.channels,
    startsAt: o.startsAt.toISOString(),
    endsAt: o.endsAt.toISOString(),
    isActive: o.isActive,
    usageLimitPerUser: o.usageLimitPerUser,
    bannerColor: o.bannerColor,
    redemptions: byOffer.get(o.id) ?? 0,
  }));
}

opsSettingsRouter.get('/offers', async (req, res) => {
  const { includeExpired } = parse(z.object({ includeExpired: z.stringbool().default(false) }), req.query);
  const rows = await db
    .select()
    .from(offers)
    .where(
      and(or(isNull(offers.storeId), eq(offers.storeId, req.staff!.storeId)), includeExpired ? undefined : gt(offers.endsAt, new Date())),
    )
    .orderBy(desc(offers.isActive), asc(offers.endsAt));
  res.json(await serializeOffers(rows));
});

async function assertUniqueCode(storeId: string, code: string | null | undefined, exceptId?: string) {
  if (!code) return;
  const clash = await db
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.code, code), or(isNull(offers.storeId), eq(offers.storeId, storeId)), gt(offers.endsAt, new Date())));
  if (clash.some((c) => c.id !== exceptId)) throw conflict(`The code ${code} is already used by another live offer`);
}

opsSettingsRouter.post('/offers', leadership, async (req, res) => {
  const input = parse(OfferSchema, req.body);
  await assertUniqueCode(req.staff!.storeId, input.code);
  const [row] = await db
    .insert(offers)
    .values({
      ...input,
      storeId: req.staff!.storeId,
      code: input.code ?? null,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      createdById: req.auth!.userId,
    })
    .returning();
  res.status(201).json((await serializeOffers([row!]))[0]);
});

opsSettingsRouter.patch('/offers/:offerId', leadership, async (req, res) => {
  const offerId = parse(IdSchema, req.params.offerId);
  const [existing] = await db.select().from(offers).where(eq(offers.id, offerId)).limit(1);
  if (!existing) throw notFound('Offer');
  if (existing.storeId !== req.staff!.storeId) throw forbidden('Company-wide offers are managed by the SmartCart team');
  const merged = parse(OfferSchema, {
    ...existing,
    startsAt: existing.startsAt.toISOString(),
    endsAt: existing.endsAt.toISOString(),
    ...req.body,
  });
  await assertUniqueCode(req.staff!.storeId, merged.code, offerId);
  const [row] = await db
    .update(offers)
    .set({ ...merged, code: merged.code ?? null, startsAt: new Date(merged.startsAt), endsAt: new Date(merged.endsAt) })
    .where(eq(offers.id, offerId))
    .returning();
  res.json((await serializeOffers([row!]))[0]);
});

opsSettingsRouter.delete('/offers/:offerId', leadership, async (req, res) => {
  const offerId = parse(IdSchema, req.params.offerId);
  const [existing] = await db.select().from(offers).where(eq(offers.id, offerId)).limit(1);
  if (!existing || existing.storeId !== req.staff!.storeId) throw notFound('Offer');
  // Keep history for analytics: deactivate instead of deleting.
  await db.update(offers).set({ isActive: false, endsAt: new Date() }).where(eq(offers.id, offerId));
  res.status(204).end();
});

// --- Devices (exit gates, smart carts, kiosks) ------------------------------------------------

function serializeDevice(d: typeof devices.$inferSelect): Device {
  return {
    id: d.id,
    storeId: d.storeId,
    type: d.type,
    name: d.name,
    apiKeyPrefix: d.apiKeyPrefix,
    isActive: d.isActive,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

export function newDeviceKey(): string {
  return `scdk_${randomToken(24)}`;
}

opsSettingsRouter.get('/devices', leadership, async (req, res) => {
  const rows = await db.select().from(devices).where(eq(devices.storeId, req.staff!.storeId)).orderBy(asc(devices.type), asc(devices.name));
  res.json(rows.map(serializeDevice));
});

opsSettingsRouter.post('/devices', leadership, async (req, res) => {
  const input = parse(CreateDeviceSchema, req.body);
  const apiKey = newDeviceKey();
  const [row] = await db
    .insert(devices)
    .values({
      storeId: req.staff!.storeId,
      type: input.type,
      name: input.name,
      apiKeyHash: sha256(apiKey),
      apiKeyPrefix: apiKey.slice(0, 12),
    })
    .returning();
  const body: DeviceWithKey = { ...serializeDevice(row!), apiKey };
  res.status(201).json(body);
});

opsSettingsRouter.post('/devices/:deviceId/rotate-key', leadership, async (req, res) => {
  const deviceId = parse(IdSchema, req.params.deviceId);
  const apiKey = newDeviceKey();
  const [row] = await db
    .update(devices)
    .set({ apiKeyHash: sha256(apiKey), apiKeyPrefix: apiKey.slice(0, 12) })
    .where(and(eq(devices.id, deviceId), eq(devices.storeId, req.staff!.storeId)))
    .returning();
  if (!row) throw notFound('Device');
  const body: DeviceWithKey = { ...serializeDevice(row), apiKey };
  res.json(body);
});

opsSettingsRouter.patch('/devices/:deviceId', leadership, async (req, res) => {
  const deviceId = parse(IdSchema, req.params.deviceId);
  const input = parse(z.object({ name: z.string().trim().min(2).max(40).optional(), isActive: z.boolean().optional() }), req.body);
  const [row] = await db
    .update(devices)
    .set(input)
    .where(and(eq(devices.id, deviceId), eq(devices.storeId, req.staff!.storeId)))
    .returning();
  if (!row) throw notFound('Device');
  res.json(serializeDevice(row));
});
