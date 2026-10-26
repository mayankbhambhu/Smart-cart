import { pool } from '../db/client';
import { runMigrations } from '../db/migrate';
import { logger } from '../lib/logger';

runMigrations()
  .then(() => logger.info('Database migrations applied'))
  .catch((error: unknown) => {
    logger.error(error, 'Migration failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
