/**
 * HTTP hardening that applies to the whole API.
 */
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
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
