/**
 * Route protection, step 1: WHO is calling?
 *
 * Expects `Authorization: Bearer <access JWT>`. Verifies the signature and
 * expiry, then re-checks the user's status on every request so that a
 * suspension takes effect immediately rather than when the token expires.
 * (The query is a single indexed lookup; permissions come from a cache.)
 */
import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { Unauthorized, Forbidden } from '../lib/errors.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { getAccessProfile } from '../modules/rbac/rbac.service.js';

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw Unauthorized();

  const claims = verifyAccessToken(header.slice(7)); // throws 401 on bad/expired token

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, timezone: true, status: true, tokenVersion: true },
  });
  if (!user || user.tokenVersion !== claims.tv) throw Unauthorized('Session expired', 'TOKEN_REVOKED');
  if (user.status !== 'ACTIVE') throw Forbidden('Account is not active', `ACCOUNT_${user.status}`);

  const access = await getAccessProfile(user.id);
  req.auth = {
    userId: user.id,
    email: user.email,
    timezone: user.timezone,
    roles: access.roles,
    permissions: access.permissions,
    can: (p) => access.permissions.has(p),
  };
  next();
};
