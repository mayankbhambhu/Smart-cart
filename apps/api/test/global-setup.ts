/**
 * Builds a fresh test database once per run: drop everything, apply the
 * migrations, then load the demo seed with a short order history.
 */
export default async function setup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://smartcart:smartcart@localhost:5432/smartcart_test';
  process.env.SEED_HISTORY_DAYS = '10';
  process.env.PUSH_ENABLED = 'false';

  const { sql } = await import('drizzle-orm');
  const { db, pool } = await import('../src/db/client');
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  const { runMigrations } = await import('../src/db/migrate');
  await runMigrations();
  const { seed } = await import('../src/db/seed/index');
  const log = console.log;
  console.log = () => undefined;
  try {
    await seed();
  } finally {
    console.log = log;
  }
  await pool.end();
}
