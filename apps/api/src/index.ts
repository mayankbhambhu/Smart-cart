import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/client';
import { runMigrations } from './db/migrate';
import { startJobs } from './jobs';
import { logger } from './lib/logger';
import { createRealtime } from './realtime/server';

async function main(): Promise<void> {
  if (env.MIGRATE_ON_START) {
    await runMigrations();
    logger.info('Migrations applied');
  }
  const app = createApp();
  const server = http.createServer(app);
  const io = createRealtime(server);
  const stopJobs = env.ENABLE_JOBS ? startJobs() : () => undefined;

  server.listen(env.PORT, env.HOST, () => {
    logger.info(`SmartCart API listening on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);
    stopJobs();
    void io.close();
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.fatal(error, 'Failed to start');
  process.exit(1);
});
