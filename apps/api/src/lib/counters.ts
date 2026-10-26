import { sql } from 'drizzle-orm';
import type { Executor } from '../db/client';

/** Atomically increments and returns a named counter. */
export async function nextCounter(executor: Executor, key: string): Promise<number> {
  const result = await executor.execute<{ value: number }>(sql`
    insert into counters (key, value) values (${key}, 1)
    on conflict (key) do update set value = counters.value + 1
    returning value
  `);
  return Number(result.rows[0]!.value);
}

export async function nextRequestNumber(executor: Executor, year = new Date().getUTCFullYear()): Promise<string> {
  const value = await nextCounter(executor, `credential_request:${year}`);
  return `REQ-${year}-${String(value).padStart(4, '0')}`;
}

export async function nextTicketNumber(executor: Executor, year = new Date().getUTCFullYear()): Promise<string> {
  const value = await nextCounter(executor, `ticket:${year}`);
  return `TKT-${year}-${String(value).padStart(4, '0')}`;
}

export async function nextEmployeeCode(executor: Executor, storeCode: string): Promise<string> {
  const value = await nextCounter(executor, `employee:${storeCode}`);
  return `${storeCode}-${String(value).padStart(3, '0')}`;
}
