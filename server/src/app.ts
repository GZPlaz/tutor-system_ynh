/**
 * Express application assembly (no network listening here — see server.ts),
 * which keeps the app importable by integration tests.
 *
 * Request pipeline:
 *   trust proxy → logging → security headers → rate limit
 *   → billing webhooks (raw body) → JSON/cookies → /api/<module> routes
 *   → 404 → central error handler
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { globalLimiter, securityHeaders } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { billingWebhookRouter } from './modules/billing/billing.routes.js';
import { modules } from './modules/index.js';

export function createApp() {
  const app = express();

  // nginx (YunoHost) terminates TLS and forwards X-Forwarded-*; trust exactly one hop
  // so req.ip / rate limiting / secure cookies see the real client.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(securityHeaders);
  app.use(globalLimiter);

  // Webhooks need the raw body for signature verification → before express.json().
  app.use('/api/billing/webhooks', billingWebhookRouter);

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.valid = {};
    next();
  });

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Public, non-secret settings the SPA uses to explain rules to users.
  app.get('/api/config', (_req, res) => {
    res.json({
      billingEnabled: env.BILLING_ENABLED,
      bookingMinLeadHours: env.BOOKING_MIN_LEAD_HOURS,
      bookingMaxHorizonDays: env.BOOKING_MAX_HORIZON_DAYS,
      studentCancelCutoffHours: env.STUDENT_CANCEL_CUTOFF_HOURS,
      meetingLinkWindowMin: env.MEETING_LINK_WINDOW_MIN,
      uploadMaxMb: env.UPLOAD_MAX_MB,
    });
  });

  const api = express.Router();
  for (const m of modules) api.use(m.path, m.router);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
