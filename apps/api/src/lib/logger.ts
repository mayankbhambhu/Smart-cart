import { createRequire } from 'node:module';
import pino from 'pino';
import { env, isProduction, isTest } from '../config/env';

function prettyTransport(): pino.TransportSingleOptions | undefined {
  if (isProduction || isTest) return undefined;
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } };
  } catch {
    return undefined;
  }
}

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  transport: prettyTransport(),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-device-key"]',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
});
