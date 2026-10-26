import {
  discountPercent,
  type CatalogProduct,
  type DietaryTag,
  type ItemLocation,
  type StoreLayout,
} from '@smartcart/shared';
import { and, arrayContains, asc, desc, eq, gt, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { categories, offers, orderItems, orders, products, storeProducts, stores } from '../db/schema';
import { availableQty, stockStatusOf } from './inventory';

type ProductRow = typeof products.$inferSelect;
type StoreProductRow = typeof storeProducts.$inferSelect;

export interface CatalogContext {
  aisleLabels: Map<number, string>;
  offerTags: { byProduct: Map<string, string>; byCategory: Map<string, string> };
}

export function aisleLabels(layout: StoreLayout): Map<number, string> {
  return new Map(layout.aisles.map((a) => [a.number, a.label]));
}

export function locationOf(sp: Pick<StoreProductRow, 'aisle' | 'row' | 'shelf'>, labels?: Map<number, string>): ItemLocation {
  return { aisle: sp.aisle, row: sp.row, shelf: sp.shelf, aisleLabel: labels?.get(sp.aisle) };
}

export function serializeCatalogProduct(
  product: ProductRow,
  sp: StoreProductRow,
  categoryName: string,
  context: CatalogContext,
): CatalogProduct {
  const available = availableQty(sp);
  return {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    description: product.description,
    unit: product.unit,
    categoryId: product.categoryId,
    categoryName,
    emoji: product.emoji,
    color: product.color,
    imageUrl: product.imageUrl,
    mrp: product.mrp,
    price: sp.price,
    discountPercent: discountPercent(product.mrp, sp.price),
    taxRate: product.taxRate,
    dietaryTags: product.dietaryTags,
    allergens: product.allergens,
    stockStatus: stockStatusOf(sp),
    availableQty: Math.min(available, 99),
    maxOrderQty: Math.max(0, Math.min(product.maxOrderQty, available)),
    location: locationOf(sp, context.aisleLabels),
    onShelf: sp.shelfQty > 0,
    offerTag: context.offerTags.byProduct.get(product.id) ?? context.offerTags.byCategory.get(product.categoryId) ?? null,
  };
}

/** Short labels for offers that target specific products or categories ("Buy 2 get 1", "20% off"). */
export async function loadOfferTags(executor: Executor, storeId: string): Promise<CatalogContext['offerTags']> {
  const now = new Date();
  const rows = await executor
    .select()
    .from(offers)
    .where(
      and(
        eq(offers.isActive, true),
        lte(offers.startsAt, now),
        gt(offers.endsAt, now),
        or(isNull(offers.storeId), eq(offers.storeId, storeId)),
      ),
    );
  const byProduct = new Map<string, string>();
  const byCategory = new Map<string, string>();
  for (const offer of rows) {
    const label =
      offer.type === 'BOGO'
        ? `Buy ${offer.buyQty} get ${offer.getQty}`
        : offer.type === 'PERCENT_OFF'
          ? `${offer.value}% off${offer.code ? ` · ${offer.code}` : ''}`
          : offer.type === 'FLAT_OFF'
            ? `₹${offer.value / 100} off`
            : 'Free delivery';
    if (offer.productId) byProduct.set(offer.productId, label);
    else if (offer.categoryId) byCategory.set(offer.categoryId, label);
  }
  return { byProduct, byCategory };
}

export async function loadCatalogContext(executor: Executor, storeId: string, layout?: StoreLayout): Promise<CatalogContext> {
  let storeLayout = layout;
  if (!storeLayout) {
    const [store] = await executor.select({ layout: stores.layout }).from(stores).where(eq(stores.id, storeId)).limit(1);
    storeLayout = store?.layout;
  }
  return {
    aisleLabels: storeLayout ? aisleLabels(storeLayout) : new Map(),
    offerTags: await loadOfferTags(executor, storeId),
  };
}

// ---------------------------------------------------------------------------
// Popularity (units sold in the last 30 days), cached per store for 10 minutes
// ---------------------------------------------------------------------------

const popularityCache = new Map<string, { at: number; units: Map<string, number> }>();

export async function productPopularity(executor: Executor, storeId: string): Promise<Map<string, number>> {
  const cached = popularityCache.get(storeId);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.units;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await executor
    .select({ productId: orderItems.productId, units: sql<number>`sum(${orderItems.quantity})::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.storeId, storeId), gt(orders.placedAt, since), sql`${orders.status} <> 'CANCELLED'`))
    .groupBy(orderItems.productId);
  const units = new Map(rows.map((r) => [r.productId, r.units]));
  popularityCache.set(storeId, { at: Date.now(), units });
  return units;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface CatalogFilter {
  storeId: string;
  categoryId?: string;
  q?: string;
  dietary?: DietaryTag[];
  inStockOnly?: boolean;
  productIds?: string[];
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'discount' | 'name';
  limit?: number;
  offset?: number;
}

function searchExpression() {
  return sql`lower(${products.name} || ' ' || ${products.brand})`;
}

export async function queryCatalog(
  executor: Executor,
  filter: CatalogFilter,
  context?: CatalogContext,
): Promise<{ items: CatalogProduct[]; total: number }> {
  const conditions: SQL[] = [eq(storeProducts.storeId, filter.storeId), eq(products.isActive, true)];
  if (filter.categoryId) conditions.push(eq(products.categoryId, filter.categoryId));
  if (filter.productIds) conditions.push(filter.productIds.length > 0 ? inArray(products.id, filter.productIds) : sql`false`);
  if (filter.dietary && filter.dietary.length > 0) {
    conditions.push(arrayContains(products.dietaryTags, filter.dietary));
  }
  if (filter.inStockOnly) {
    conditions.push(sql`${storeProducts.isAvailable} and (${storeProducts.shelfQty} + ${storeProducts.storageQty}) > 0`);
  }
  const q = filter.q?.trim().toLowerCase();
  if (q) {
    // Substring match, plus trigram similarity for typos ("panner" -> "paneer") on longer terms.
    conditions.push(
      q.length >= 4
        ? sql`(${searchExpression()} like ${`%${q}%`} or word_similarity(${q}, ${searchExpression()}) > 0.35)`
        : sql`${searchExpression()} like ${`%${q}%`}`,
    );
  }
  const where = and(...conditions);

  const orderBy: SQL[] = [];
  switch (filter.sort) {
    case 'price_asc':
      orderBy.push(asc(storeProducts.price));
      break;
    case 'price_desc':
      orderBy.push(desc(storeProducts.price));
      break;
    case 'discount':
      orderBy.push(sql`(${products.mrp} - ${storeProducts.price})::float / greatest(${products.mrp}, 1) desc`);
      break;
    case 'name':
      orderBy.push(asc(products.name));
      break;
    default:
      if (q) {
        orderBy.push(
          sql`case when ${searchExpression()} like ${`${q}%`} then 0 when ${searchExpression()} like ${`%${q}%`} then 1 else 2 end`,
          sql`word_similarity(${q}, ${searchExpression()}) desc`,
        );
      }
  }
  orderBy.push(asc(products.name));

  const rows = await executor
    .select({ product: products, sp: storeProducts, categoryName: categories.name, total: sql<number>`count(*) over()::int` })
    .from(storeProducts)
    .innerJoin(products, eq(products.id, storeProducts.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(where)
    .orderBy(...orderBy)
    .limit(filter.sort === 'relevance' && !q ? 1000 : (filter.limit ?? 40))
    .offset(filter.sort === 'relevance' && !q ? 0 : (filter.offset ?? 0));

  const ctx = context ?? (await loadCatalogContext(executor, filter.storeId));
  let items = rows.map((r) => serializeCatalogProduct(r.product, r.sp, r.categoryName, ctx));
  const total = rows[0]?.total ?? 0;

  // Default ordering without a search term: best sellers first.
  if ((filter.sort ?? 'relevance') === 'relevance' && !q) {
    const popularity = await productPopularity(executor, filter.storeId);
    items = items
      .sort((a, b) => (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0))
      .slice(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 40));
  }
  return { items, total };
}

export async function catalogProductsByIds(
  executor: Executor,
  storeId: string,
  productIds: string[],
  context?: CatalogContext,
): Promise<Map<string, CatalogProduct>> {
  if (productIds.length === 0) return new Map();
  const { items } = await queryCatalog(
    executor,
    { storeId, productIds: [...new Set(productIds)], sort: 'name', limit: 500 },
    context,
  );
  return new Map(items.map((p) => [p.id, p]));
}

/** Best match in a store's catalogue for a free-text list item such as "milk". */
export async function bestMatch(executor: Executor, storeId: string, text: string, context?: CatalogContext): Promise<CatalogProduct | null> {
  const { items } = await queryCatalog(executor, { storeId, q: text, inStockOnly: false, limit: 1, sort: 'relevance' }, context);
  return items[0] ?? null;
}
