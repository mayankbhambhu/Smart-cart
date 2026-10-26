import { sql } from 'drizzle-orm';
import { isProduction } from '../config/env';
import { logger } from '../lib/logger';
import { db, pool } from './client';

/** Drops every table, type and migration record. Development only. */
async function reset(): Promise<void> {
  if (isProduction) throw new Error('Refusing to reset a production database');
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  logger.info('Database reset');
}

reset()
  .catch((error: unknown) => {
    logger.error(error, 'Reset failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
