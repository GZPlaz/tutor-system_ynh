/**
 * HTTP hardening that applies to the whole API.
 */
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { Forbidden } from '../lib/errors.js';

/** Security headers. The SPA is served by nginx, so the API only returns JSON. */
export const securityHeaders = helmet({
  contentSecurityPolicy: false, // JSON API; CSP is set for the SPA in nginx
  crossOriginResourcePolicy: { policy: 'same-origin' },
});

/** Generous global limit to blunt scraping / runaway clients. */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

/** Tight limit for credential endpoints (login, register, password reset). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
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
