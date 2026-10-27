import {
  IdSchema,
  NearbyStoresQuerySchema,
  PickupSlotsQuerySchema,
  StockCheckQuerySchema,
  type StockCheckResult,
  type StoreSummary,
} from '@smartcart/shared';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { stores } from '../../db/schema';
import { parse } from '../../lib/validate';
import { loadCatalogContext, queryCatalog } from '../../services/catalog';
import { getStore, pickupSlots, serializeStore, serializeStoreDetail } from '../../services/stores';

export const storesRouter = Router();

storesRouter.get('/', async (req, res) => {
  const query = parse(NearbyStoresQuerySchema, req.query);
  const origin = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null;
  const conditions = [inArray(stores.status, ['ACTIVE', 'ONBOARDING'])];
  if (query.q) {
    const like = `%${query.q}%`;
    conditions.push(or(ilike(stores.name, like), ilike(stores.city, like), ilike(stores.addressLine, like), ilike(stores.pincode, like))!);
  }
  const rows = await db
    .select()
    .from(stores)
    .where(and(...conditions));
  const list: StoreSummary[] = rows.map((s) => serializeStore(s, origin));
  list.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.name.localeCompare(b.name));
  res.json(list);
});

/** "Is it in stock at my branch?" across every store, before leaving the house. */
storesRouter.get('/stock-check', async (req, res) => {
  const query = parse(StockCheckQuerySchema, req.query);
  const origin = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null;
  const storeRows = await db.select().from(stores).where(eq(stores.status, 'ACTIVE'));
  const byProduct = new Map<string, StockCheckResult>();
  for (const store of storeRows) {
    const context = await loadCatalogContext(db, store.id, store.layout);
    const { items } = await queryCatalog(db, { storeId: store.id, q: query.q, limit: 6, sort: 'relevance' }, context);
    for (const product of items) {
      const entry = byProduct.get(product.id) ?? {
        product: {
          id: product.id,
          name: product.name,
          brand: product.brand,
          unit: product.unit,
          emoji: product.emoji,
          color: product.color,
          imageUrl: product.imageUrl,
          mrp: product.mrp,
        },
        stores: [],
      };
      entry.stores.push({
        store: serializeStore(store, origin),
        stockStatus: product.stockStatus,
        availableQty: product.availableQty,
        price: product.price,
        location: product.location,
      });
      byProduct.set(product.id, entry);
    }
  }
  const results = [...byProduct.values()].slice(0, 8);
  for (const result of results) {
    result.stores.sort((a, b) => (a.store.distanceKm ?? 0) - (b.store.distanceKm ?? 0));
  }
  res.json(results);
});

storesRouter.get('/:storeId', async (req, res) => {
  const storeId = parse(IdSchema, req.params.storeId);
  const query = parse(z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), req.query);
  const origin = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null;
  res.json(serializeStoreDetail(await getStore(db, storeId), origin));
});

storesRouter.get('/:storeId/pickup-slots', async (req, res) => {
  const query = parse(PickupSlotsQuerySchema, { ...req.query, storeId: req.params.storeId });
  const store = await getStore(db, query.storeId);
  res.json(await pickupSlots(db, store, query.days));
});
