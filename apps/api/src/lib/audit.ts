import type { Executor } from '../db/client';
import { auditLogs } from '../db/schema';
import { logger } from './logger';

export interface AuditEntry {
  actorId?: string | null;
  actorKind: string;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  storeId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Records security- and business-relevant actions for the admin audit trail. */
export async function audit(executor: Executor, entry: AuditEntry): Promise<void> {
  try {
    await executor.insert(auditLogs).values({
      actorId: entry.actorId ?? null,
      actorKind: entry.actorKind,
      actorName: entry.actorName ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      storeId: entry.storeId ?? null,
      metadata: entry.metadata ?? {},
      ip: entry.ip ?? null,
    });
  } catch (error) {
    logger.error(error, 'Failed to write audit log');
    throw error;
  }
}
