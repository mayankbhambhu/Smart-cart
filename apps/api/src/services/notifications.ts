import type { AppNotification, NotificationType } from '@smartcart/shared';
import { SocketEvents } from '@smartcart/shared';
import type { Executor } from '../db/client';
import { notifications } from '../db/schema';
import type { AfterCommit } from '../lib/tx';
import { broadcast } from '../realtime/emitter';
import { sendPush } from './push';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Also send a mobile push notification (default true). */
  push?: boolean;
}

export function serializeNotification(row: typeof notifications.$inferSelect): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Stores an in-app notification for each user and, after commit, delivers it
 * over the socket and as a push notification.
 */
export async function notifyUsers(
  executor: Executor,
  userIds: (string | null | undefined)[],
  input: NotifyInput,
  afterCommit?: AfterCommit,
): Promise<void> {
  const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (recipients.length === 0) return;
  const rows = await executor
    .insert(notifications)
    .values(recipients.map((userId) => ({ userId, type: input.type, title: input.title, body: input.body, data: input.data ?? {} })))
    .returning();

  const deliver = async () => {
    for (const row of rows) broadcast.toUser(row.userId, SocketEvents.NOTIFICATION, serializeNotification(row));
    if (input.push !== false) await sendPush(recipients, { title: input.title, body: input.body, data: input.data });
  };
  if (afterCommit) afterCommit(deliver);
  else await deliver();
}
