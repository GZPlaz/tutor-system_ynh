/**
 * HTTP hardening that applies to the whole API.
 */
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { Forbidden } from '../lib/errors.js';

/**
 * Security headers for the API and the web app it serves. The CSP allows only our own
 * scripts; styles may be inline (the app sets colours at runtime from the branding
 * settings) and Google Fonts are allowed because some font pairings use them.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-origin' },
});

/**
 * Generous limit on the API (not the web app's own files) to blunt scraping and runaway
 * clients. Per network address, so it is configurable: a school where everyone shares one
 * address may need more (RATE_LIMIT_PER_MINUTE in .env).
 */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_PER_MINUTE,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => !req.path.startsWith('/api/') || req.path === '/api/health',
});

/**
 * Sign-in attempts are counted per account and network address, not per address alone,
 * so a classroom on one connection isn't locked out together. (Each account also locks
 * itself after repeated wrong passwords: MAX_FAILED_LOGINS.)
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${String((req.body as { email?: unknown })?.email ?? '').toLowerCase().slice(0, 200)}`,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' } },
});

/** Limit for the other credential endpoints (register, password reset), per address. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' } },
});

/**
 * CSRF defence for the cookie-authenticated endpoints (refresh/logout).
 * The refresh cookie is SameSite=Strict already; this adds an Origin check
 * as defence in depth. Bearer-token endpoints are not CSRF-able.
 */
export const requireSameOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin ?? req.headers.referer;
  if (env.isProd && (!origin || !origin.startsWith(env.appOrigin))) {
    throw Forbidden('Cross-site request blocked', 'BAD_ORIGIN');
  }
  next();
};
