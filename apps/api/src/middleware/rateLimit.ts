import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

const common = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down and try again shortly' } },
};

/** Login, OTP and password endpoints. */
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 50 });

/** Everything else under /api. */
export const apiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 600 });

/** Hardware endpoints get a higher ceiling (busy exit gates and carts). */
export const deviceLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 1200 });
