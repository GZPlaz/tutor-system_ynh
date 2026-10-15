/**
 * Provider-agnostic billing persistence. Webhook handlers (any provider) end
 * up calling `applyEvent`, which is idempotent thanks to billing_events'
 * unique (provider, event_id).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import type { BillingEventNormalized } from './providers.js';
import { getEntitlements } from './entitlements.js';

export async function applyEvent(provider: string, event: BillingEventNormalized, raw: unknown): Promise<void> {
  // Idempotency: insert the event first; a duplicate delivery hits the unique index.
  try {
    await prisma.billingEvent.create({
      data: { provider, eventId: event.eventId, type: event.kind, payload: raw as Prisma.InputJsonValue },
    });
  } catch {
    logger.info({ provider, eventId: event.eventId }, 'Duplicate billing event ignored');
    return;
  }

  switch (event.kind) {
    case 'subscription.updated': {
      const plan = await prisma.plan.findUniqueOrThrow({ where: { key: event.planKey } });
      await prisma.subscription.upsert({
        where: { providerSubscriptionRef: event.providerSubscriptionRef },
        create: {
          userId: event.userId,
          planId: plan.id,
          provider,
          status: event.status,
          providerCustomerRef: event.providerCustomerRef,
          providerSubscriptionRef: event.providerSubscriptionRef,
          currentPeriodStart: event.currentPeriodStart,
          currentPeriodEnd: event.currentPeriodEnd,
          cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
        },
        update: {
          planId: plan.id,
          status: event.status,
          currentPeriodStart: event.currentPeriodStart,
          currentPeriodEnd: event.currentPeriodEnd,
          cancelAtPeriodEnd: event.cancelAtPeriodEnd ?? false,
        },
      });
      break;
    }
    case 'payment.succeeded':
    case 'payment.failed':
    case 'payment.refunded': {
      const status = event.kind === 'payment.succeeded' ? 'SUCCEEDED' : event.kind === 'payment.failed' ? 'FAILED' : 'REFUNDED';
      await prisma.payment.upsert({
        where: { providerPaymentRef: event.providerPaymentRef },
        create: {
          userId: event.userId,
          amountCents: event.amountCents,
          currency: event.currency,
          status,
          provider,
          providerPaymentRef: event.providerPaymentRef,
          bookingId: event.bookingId,
        },
        update: { status },
      });
      break;
    }
    case 'ignored':
      break;
  }

  await prisma.billingEvent.update({
    where: { provider_eventId: { provider, eventId: event.eventId } },
    data: { processedAt: new Date() },
  });
}

export async function getMyBilling(userId: string) {
  const [subscriptions, payments, entitlements] = await Promise.all([
    prisma.subscription.findMany({ where: { userId }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
    prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    getEntitlements(userId),
  ]);
  return { subscriptions, payments, entitlements: [...entitlements] };
}
