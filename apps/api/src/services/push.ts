import { inArray } from 'drizzle-orm';
import { env, isTest } from '../config/env';
import { db } from '../db/client';
import { pushTokens } from '../db/schema';
import { logger } from '../lib/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Sends a push notification to every registered device of the given users via Expo. */
export async function sendPush(userIds: string[], message: PushMessage): Promise<void> {
  if (!env.PUSH_ENABLED || isTest || userIds.length === 0) return;
  const tokens = await db.select({ token: pushTokens.token }).from(pushTokens).where(inArray(pushTokens.userId, userIds));
  const expoTokens = tokens.map((t) => t.token).filter((t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));
  if (expoTokens.length === 0) return;

  const payload = expoTokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: 'default',
    priority: 'high',
  }));
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) logger.warn({ status: response.status }, 'Expo push request failed');
  } catch (error) {
    logger.warn({ err: error }, 'Expo push request errored');
  }
}
