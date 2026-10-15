/**
 * Process entry point: sync RBAC, start HTTP + background jobs, and shut down
 * gracefully on SIGTERM (systemd stop/restart) so in-flight requests finish.
 */
import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { syncRbac } from './modules/rbac/rbac.service.js';
import { verifySmtp } from './modules/email/mailer.js';
import { startJobs, stopJobs } from './jobs/scheduler.js';

async function main() {
  await prisma.$connect();
  await syncRbac();
  await verifySmtp();

  const server = createApp().listen(env.PORT, env.HOST, () => {
    logger.info({ port: env.PORT, host: env.HOST, appUrl: env.APP_URL }, 'MindAccel API listening');
  });
  startJobs();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    stopJobs();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
