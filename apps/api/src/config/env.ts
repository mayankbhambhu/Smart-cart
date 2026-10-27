import 'dotenv/config';
import { z } from 'zod';

const bool = (fallback: boolean) => z.stringbool().default(fallback);
const optional = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));
const list = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );

const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me-0123456789abcdef';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().default('postgres://smartcart:smartcart@localhost:5432/smartcart'),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  MIGRATIONS_DIR: optional,
  REDIS_URL: optional,

  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: bool(false),

  CORS_ORIGINS: list,
  PUBLIC_WEB_URL: z.string().default('http://localhost:5173'),

  // Sign-in providers
  GOOGLE_WEB_CLIENT_ID: optional,
  GOOGLE_IOS_CLIENT_ID: optional,
  GOOGLE_ANDROID_CLIENT_ID: optional,
  APPLE_CLIENT_IDS: list,
  APPLE_SERVICE_ID: optional,
  APPLE_REDIRECT_URI: optional,
  AUTH_DEMO_SOCIAL: bool(true),
  OTP_DEV_ECHO: bool(true),
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_FROM_NUMBER: optional,

  // Payments
  CURRENCY: z.string().length(3).default('INR'),
  MERCHANT_NAME: z.string().default('SmartCart'),
  MERCHANT_COUNTRY: z.string().length(2).default('IN'),
  PAYMENTS_DEMO_MODE: bool(true),
  STRIPE_SECRET_KEY: optional,
  STRIPE_PUBLISHABLE_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  PAYPAL_CLIENT_ID: optional,
  PAYPAL_CLIENT_SECRET: optional,
  PAYPAL_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,

  // Push notifications (Expo)
  EXPO_ACCESS_TOKEN: optional,
  PUSH_ENABLED: bool(true),

  ENABLE_JOBS: bool(true),
  MIGRATE_ON_START: bool(false),
  /** Sign-in attempts per IP per 15 minutes (login, OTP, password reset). */
  AUTH_RATE_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .default(process.env.NODE_ENV === 'production' ? 30 : 500),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (env.JWT_ACCESS_SECRET === DEV_JWT_SECRET) {
      throw new Error('JWT_ACCESS_SECRET must be set to a strong random value in production');
    }
  }
  if (env.CORS_ORIGINS.length === 0) {
    env.CORS_ORIGINS = [env.PUBLIC_WEB_URL, 'http://localhost:5173', 'http://localhost:8081', 'http://localhost:19006'];
  }
  return env;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
