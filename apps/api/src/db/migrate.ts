import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../config/env';
import { db } from './client';

export async function runMigrations(): Promise<void> {
  const migrationsFolder = env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });
}
