import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import { sql } from 'drizzle-orm';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { db } from './db/client';
import { logger } from './lib/logger';
import { authenticate } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter } from './middleware/rateLimit';
import { adminRouter } from './modules/admin/routes';
import { authRouter } from './modules/auth/routes';
import { catalogRouter } from './modules/catalog/routes';
import { devicesRouter } from './modules/devices/routes';
import { instoreRouter } from './modules/instore/routes';
import { listsRouter } from './modules/lists/routes';
import { meRouter } from './modules/me/routes';
import { opsRouter } from './modules/ops';
import { ordersRouter } from './modules/orders/routes';
import { paymentWebhooksRouter, paymentsRouter } from './modules/payments/routes';
import { storesRouter } from './modules/stores/routes';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const corsOptions: CorsOptions = {
    // Native apps send no Origin header; browsers must be on the allow-list.
    origin: (origin, callback) => callback(null, !origin || env.CORS_ORIGINS.includes(origin)),
    credentials: true,
  };
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors(corsOptions));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/api/v1/health' },
      customLogLevel: (_req, res, error) => (error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );

  // Webhooks need the raw body to verify provider signatures.
  app.use('/api/v1/payments/webhooks', express.raw({ type: '*/*', limit: '1mb' }), paymentWebhooksRouter);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const health = async (_req: express.Request, res: express.Response) => {
    await db.execute(sql`select 1`);
    res.json({ status: 'ok', time: new Date().toISOString() });
  };
  app.get('/health', health);
  app.get('/api/v1/health', health);

  const api = express.Router();
  api.use(apiLimiter, authenticate);
  api.use('/auth', authRouter);
  api.use('/me', meRouter);
  api.use('/catalog', catalogRouter);
  api.use('/stores', storesRouter);
  api.use('/lists', listsRouter);
  api.use('/orders', ordersRouter);
  api.use('/payments', paymentsRouter);
  api.use('/instore', instoreRouter);
  api.use('/devices', devicesRouter);
  api.use('/ops/stores/:storeId', opsRouter);
  api.use('/admin', adminRouter);
  app.use('/api/v1', api);
  app.use('/api', notFoundHandler);

  // Optionally serve the built web app from the same origin (single-service deploys).
  const webDist = process.env.WEB_DIST_DIR ? path.resolve(process.env.WEB_DIST_DIR) : null;
  if (webDist && existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { maxAge: '1h', index: false }));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
