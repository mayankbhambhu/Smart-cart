import { AnalyticsRangeSchema } from '@smartcart/shared';
import { Router, type Request } from 'express';
import { parse } from '../../lib/validate';
import { allowRoles } from '../../middleware/auth';
import * as analytics from '../../services/analytics';

/** Business analysis for owners and store managers. */
export const opsAnalyticsRouter = Router({ mergeParams: true });
opsAnalyticsRouter.use(allowRoles('OWNER', 'STORE_MANAGER'));

function range(req: Request) {
  const query = parse(AnalyticsRangeSchema, req.query);
  return { query, range: { storeId: req.staff!.storeId, from: query.from, to: query.to, timezone: req.staff!.timezone } };
}

opsAnalyticsRouter.get('/summary', async (req, res) => {
  res.json(await analytics.summary(range(req).range));
});

opsAnalyticsRouter.get('/trend', async (req, res) => {
  const { query, range: r } = range(req);
  res.json(await analytics.trend(r, query.granularity));
});

opsAnalyticsRouter.get('/top-products', async (req, res) => {
  const { query, range: r } = range(req);
  res.json(await analytics.topProducts(r, query.sort, query.limit));
});

opsAnalyticsRouter.get('/categories', async (req, res) => {
  res.json(await analytics.categoryPerformance(range(req).range));
});

opsAnalyticsRouter.get('/offers', async (req, res) => {
  res.json(await analytics.offerPerformance(range(req).range));
});

opsAnalyticsRouter.get('/rush-hours', async (req, res) => {
  res.json(await analytics.rushHours(range(req).range));
});

opsAnalyticsRouter.get('/payments', async (req, res) => {
  res.json(await analytics.paymentMix(range(req).range));
});

opsAnalyticsRouter.get('/inventory-health', async (req, res) => {
  res.json(await analytics.inventoryHealth(req.staff!.storeId));
});

opsAnalyticsRouter.get('/basket', async (req, res) => {
  const { query, range: r } = range(req);
  res.json(await analytics.basketInsights(r, query.limit));
});

opsAnalyticsRouter.get('/customers', async (req, res) => {
  res.json(await analytics.customerInsights(range(req).range));
});

opsAnalyticsRouter.get('/staff', async (req, res) => {
  const { range: r } = range(req);
  res.json(await analytics.staffPerformance({ ...r, storeId: req.staff!.storeId }));
});

opsAnalyticsRouter.get('/export.csv', async (req, res) => {
  const { range: r } = range(req);
  res
    .type('text/csv')
    .attachment(`smartcart-sales-${r.from}-to-${r.to}.csv`)
    .send(await analytics.dailyCsv(r));
});
