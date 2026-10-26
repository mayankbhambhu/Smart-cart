import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

// COUNT/SUM return int8 and AVG returns numeric; parse both as JS numbers
// (safe: all monetary sums stay far below 2^53 paise).
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_SIZE,
});

export const db = drizzle({ client: pool, schema, casing: 'snake_case' });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Functions that accept either the pool-backed db or an open transaction. */
export type Executor = Database | Transaction;

export { schema };
