import { db, type Transaction } from '../db/client';
import { logger } from './logger';

export type AfterCommit = (hook: () => void | Promise<void>) => void;

/**
 * Runs `work` in a database transaction. Side effects that must only happen
 * once the data is committed (socket broadcasts, push notifications) are
 * registered with `afterCommit` and run after a successful commit.
 */
export async function transaction<T>(work: (tx: Transaction, afterCommit: AfterCommit) => Promise<T>): Promise<T> {
  const hooks: (() => void | Promise<void>)[] = [];
  const result = await db.transaction((tx) => work(tx, (hook) => hooks.push(hook)));
  for (const hook of hooks) {
    try {
      await hook();
    } catch (error) {
      logger.error(error, 'after-commit hook failed');
    }
  }
  return result;
}
