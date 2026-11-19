/**
 * Route protection, step 2: MAY they do this?
 *
 *   router.post('/roles', requirePermission(P.ROLES_MANAGE), handler)
 *   router.get('/bookings', requireAnyPermission(P.BOOKINGS_READ_OWN, P.BOOKINGS_READ_ANY), handler)
 *
 * Always mount `authenticate` before these. Record-level ownership rules
 * ("only your own booking") live in the service layer, which receives req.auth.
 */
import type { Request, RequestHandler } from 'express';
import { Forbidden, Unauthorized } from '../lib/errors.js';
import type { PermissionKey } from '../modules/rbac/permissions.js';

export function requirePermission(...required: PermissionKey[]): RequestHandler {
  return (req, _res, next) => {
    const auth = req.auth;
    if (!auth) throw Unauthorized();
    const missing = required.filter((p) => !auth.permissions.has(p));
    if (missing.length) throw Forbidden(`Missing permission: ${missing.join(', ')}`);
    next();
  };
}

export function requireAnyPermission(...options: PermissionKey[]): RequestHandler {
  return (req, _res, next) => {
    const auth = req.auth;
    if (!auth) throw Unauthorized();
    if (!options.some((p) => auth.permissions.has(p))) {
      throw Forbidden(`Requires one of: ${options.join(', ')}`);
    }
    next();
  };
}

/** Narrowing helper for handlers mounted behind `authenticate`. */
export function authOf(req: Request): Express.AuthContext {
  if (!req.auth) throw Unauthorized();
  return req.auth;
}
