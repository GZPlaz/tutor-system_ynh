/**
 * Express application assembly (no network listening here — see server.ts),
 * which keeps the app importable by integration tests.
 *
 * Request pipeline:
 *   trust proxy → logging → security headers → rate limit
 *   → JSON/cookies → /api/<module> routes
 *   → the web app (static files + deep-link fallback) → 404 → central error handler
 */
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { globalLimiter, securityHeaders } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { modules } from './modules/index.js';
import { settings } from './modules/settings/general.js';

export function createApp() {
  const app = express();

  // nginx (YunoHost) terminates TLS and forwards X-Forwarded-*; trust exactly one hop
  // so req.ip / rate limiting / secure cookies see the real client.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Every request gets an id (or keeps a sane one from the proxy). It is logged with the
  // request, returned as X-Request-Id, and shown to users as the reference on unexpected errors.
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      genReqId: (req, res) => {
        const given = req.headers['x-request-id'];
        const id = typeof given === 'string' && /^[\w-]{8,64}$/.test(given) ? given : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );
  app.use(securityHeaders);
  app.use(globalLimiter);

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
    const s = settings();
    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      bookingMinLeadHours: s.booking.minLeadHours,
      bookingMaxHorizonDays: s.booking.maxHorizonDays,
      studentCancelCutoffHours: s.booking.studentCancelCutoffHours,
      uploadMaxMb: env.UPLOAD_MAX_MB,
      registrationOpen: s.registration.open,
      registrationNeedsApproval: s.registration.requireApproval,
      allowedEmailDomains: s.registration.allowedEmailDomains,
      guestBooking: !s.booking.requireAccount,
      maintenance: s.maintenance.enabled ? { message: s.maintenance.message } : null,
    });
  });

  const api = express.Router();
  for (const m of modules) api.use(m.path, m.router);
  app.use('/api', api);

  // The web app itself. This service is the whole site: nginx only forwards requests to it,
  // so there is no separate static-file location to keep in sync. Hashed assets are cached
  // for a year; index.html is never cached so a new release shows up immediately.
  const dist = path.resolve(process.cwd(), env.CLIENT_DIST_DIR);
  const indexHtml = path.join(dist, 'index.html');
  if (existsSync(indexHtml)) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders: (res, file) => {
          const hashed = file.includes(`${path.sep}assets${path.sep}`);
          res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    // Deep links such as /sessions or /booking/<id> belong to the SPA's router.
    app.get(/^\/(?!api(\/|$)).*/, (req, res, next) => {
      if (!req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  } else {
    logger.warn({ dist }, 'Web app build not found — only the API is being served');
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
