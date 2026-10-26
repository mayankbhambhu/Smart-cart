import { Router } from 'express';
import { requireAuth, requireStaff } from '../../middleware/auth';
import { opsAnalyticsRouter } from './analytics';
import { opsInventoryRouter } from './inventory';
import { opsOrdersRouter } from './orders';
import { opsSettingsRouter } from './settings';
import { opsTeamRouter } from './team';
import { opsWorkRouter } from './work';

/**
 * Store operations API, mounted at /api/v1/ops/stores/:storeId.
 * Every route runs with the caller's role in that store (req.staff).
 */
export const opsRouter = Router({ mergeParams: true });
opsRouter.use(requireAuth('STAFF'), requireStaff);

opsRouter.use(opsOrdersRouter);
opsRouter.use(opsInventoryRouter);
opsRouter.use(opsWorkRouter);
opsRouter.use(opsTeamRouter);
opsRouter.use(opsSettingsRouter);
opsRouter.use('/analytics', opsAnalyticsRouter);
