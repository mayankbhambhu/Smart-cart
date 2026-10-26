import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { db, pool } from './client';

export async function runMigrations(): Promise<void> {
  const migrationsFolder = env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runMigrations()
    .then(() => logger.info('Database migrations applied'))
    .catch((error: unknown) => {
      logger.error(error, 'Migration failed');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
