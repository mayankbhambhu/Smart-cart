import { pool } from '../db/client';
import { seed } from '../db/seed';
import { logger } from '../lib/logger';

seed()
  .catch((error: unknown) => {
    logger.error(error, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
