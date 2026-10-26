import { env, isTest } from '../config/env';
import { logger } from '../lib/logger';

export function smsConfigured(): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
}

/** Sends an SMS through Twilio when configured; otherwise logs it (development). */
export async function sendSms(to: string, body: string): Promise<void> {
  if (!smsConfigured()) {
    if (!isTest) logger.info({ to, body }, 'SMS (not sent: Twilio is not configured)');
    return;
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER!, Body: body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    logger.error({ status: response.status, body: await response.text() }, 'Twilio SMS failed');
    throw new Error('Could not send the SMS, please try again');
  }
}
