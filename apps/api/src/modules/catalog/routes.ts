import {
  CatalogQuerySchema,
  IdSchema,
  ProductLookupQuerySchema,
  type Category,
  type HomeFeed,
  type OfferBanner,
  type Paginated,
  type CatalogProduct,
} from '@smartcart/shared';
import { and, asc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { categories, offers, products, storeProducts } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { loadCatalogContext, queryCatalog, serializeCatalogProduct } from '../../services/catalog';
import { getStore, serializeStore } from '../../services/stores';

export const catalogRouter = Router();

const StoreQuery = z.object({ storeId: IdSchema });

catalogRouter.get('/categories', async (req, res) => {
  const { storeId } = parse(StoreQuery, req.query);
  res.json(await categoriesForStore(storeId));
});

catalogRouter.get('/home', async (req, res) => {
  const { storeId } = parse(StoreQuery, req.query);
  const store = await getStore(db, storeId);
  const context = await loadCatalogContext(db, storeId, store.layout);
  const [cats, bestsellers, banners] = await Promise.all([
    categoriesForStore(storeId),
    queryCatalog(db, { storeId, inStockOnly: true, limit: 12, sort: 'relevance' }, context),
    activeBanners(storeId),
  ]);
  const featured = cats.slice(0, 8);
  const sections = await Promise.all(
    featured.map(async (category) => ({
      title: category.name,
      categoryId: category.id,
      products: (await queryCatalog(db, { storeId, categoryId: category.id, limit: 10, sort: 'relevance' }, context)).items,
    })),
  );
  const body: HomeFeed = {
    store: serializeStore(store),
    banners,
    categories: cats,
    sections: [{ title: 'Bestsellers near you', categoryId: null, products: bestsellers.items }, ...sections],
  };
  res.json(body);
});

catalogRouter.get('/products', async (req, res) => {
  const query = parse(CatalogQuerySchema, req.query);
  const result = await queryCatalog(db, {
    storeId: query.storeId,
    categoryId: query.categoryId,
    q: query.q,
    dietary: query.dietary,
    inStockOnly: query.inStockOnly,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  });
  const body: Paginated<CatalogProduct> = { ...result, limit: query.limit, offset: query.offset };
  res.json(body);
});

catalogRouter.get('/products/:productId', async (req, res) => {
  const { storeId } = parse(StoreQuery, req.query);
  const productId = parse(IdSchema, req.params.productId);
  const [row] = await db
    .select({ product: products, sp: storeProducts, categoryName: categories.name })
    .from(storeProducts)
    .innerJoin(products, eq(products.id, storeProducts.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(storeProducts.storeId, storeId), eq(storeProducts.productId, productId)))
    .limit(1);
  if (!row) throw notFound('Product');
  const context = await loadCatalogContext(db, storeId);
  res.json(serializeCatalogProduct(row.product, row.sp, row.categoryName, context));
});

/** Barcode scan in the aisle (Scan & Go) or at the pickup counter. */
catalogRouter.get('/lookup', async (req, res) => {
  const { storeId, barcode } = parse(ProductLookupQuerySchema, req.query);
  const [row] = await db
    .select({ product: products, sp: storeProducts, categoryName: categories.name })
    .from(products)
    .innerJoin(storeProducts, and(eq(storeProducts.productId, products.id), eq(storeProducts.storeId, storeId)))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.barcode, barcode))
    .limit(1);
  if (!row) throw notFound('No product with this barcode in this store');
  const context = await loadCatalogContext(db, storeId);
  res.json(serializeCatalogProduct(row.product, row.sp, row.categoryName, context));
});

async function categoriesForStore(storeId: string): Promise<Category[]> {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      emoji: categories.emoji,
      color: categories.color,
      sortOrder: categories.sortOrder,
      productCount: sql<number>`count(${storeProducts.id})::int`,
    })
    .from(categories)
    .innerJoin(products, eq(products.categoryId, categories.id))
    .innerJoin(storeProducts, and(eq(storeProducts.productId, products.id), eq(storeProducts.storeId, storeId)))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder));
  return rows;
}

async function activeBanners(storeId: string): Promise<OfferBanner[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(offers)
    .where(
      and(
        eq(offers.isActive, true),
        lte(offers.startsAt, now),
        gt(offers.endsAt, now),
        or(isNull(offers.storeId), eq(offers.storeId, storeId)),
      ),
    )
    .orderBy(asc(offers.createdAt));
  return rows.map((o) => ({
    id: o.id,
    code: o.code,
    title: o.title,
    description: o.description,
    type: o.type,
    bannerColor: o.bannerColor,
    minOrderValue: o.minOrderValue,
    endsAt: o.endsAt.toISOString(),
  }));
}
