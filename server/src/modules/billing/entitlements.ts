/**
 * ENTITLEMENTS — what a user has paid for, decoupled from what their ROLE
 * allows. RBAC answers "may a student book?"; entitlements answer "has THIS
 * student got an active plan that includes booking?".
 *
 *   router.post('/bookings', requireEntitlement('sessions.book'), ...)
 *
 * While BILLING_ENABLED=false every check passes, so you can wire the
 * middleware into routes today and flip the paywall on later.
 *
 * Plans grant entitlement keys via plans.features (JSON array of strings).
 * Staff (anyone with billing:manage or bookings:manage_any) bypass the paywall.
 */
import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { PaymentRequired, Unauthorized } from '../../lib/errors.js';
import { P } from '../rbac/permissions.js';

export type EntitlementKey = 'sessions.book' | 'resources.premium' | (string & {});

export async function getEntitlements(userId: string): Promise<Set<string>> {
  const subs = await prisma.subscription.findMany({
    where: {
      userId,
      status: { in: ['ACTIVE', 'TRIALING'] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
    },
    select: { plan: { select: { features: true } } },
  });
  const keys = new Set<string>();
  for (const s of subs) {
    const features = s.plan.features;
    if (Array.isArray(features)) for (const f of features) if (typeof f === 'string') keys.add(f);
  }
  return keys;
}

export function requireEntitlement(key: EntitlementKey): RequestHandler {
  return async (req, _res, next) => {
    if (!env.BILLING_ENABLED) return next();
    const auth = req.auth;
    if (!auth) throw Unauthorized();
    if (auth.can(P.BILLING_MANAGE) || auth.can(P.BOOKINGS_MANAGE_ANY)) return next();
    const entitlements = await getEntitlements(auth.userId);
    if (!entitlements.has(key)) throw PaymentRequired();
    next();
  };
}
