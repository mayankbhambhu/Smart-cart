import { isProduction } from '../config/env';
import { pool } from '../db/client';
import { seed } from '../db/seed';
import { logger } from '../lib/logger';

// Seeding empties every table first, so a production database needs an explicit opt-in.
if (isProduction && process.env.ALLOW_DEMO_SEED !== 'true') {
  logger.error('Refusing to seed: it deletes all existing data. Set ALLOW_DEMO_SEED=true to load the demo data anyway.');
  process.exitCode = 1;
  void pool.end();
} else {
  seed()
    .catch((error: unknown) => {
      logger.error(error, 'Seed failed');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
