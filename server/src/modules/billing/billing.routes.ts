/**
 * /api/billing
 *   GET  /plans                     public list of active plans
 *   GET  /me                        my subscriptions, payments, entitlements
 *   POST /checkout                  { planKey } → { redirectUrl }   (501 until a provider exists)
 *   POST /plans                     billing:manage
 *   POST /webhooks/:provider        raw body; mounted BEFORE express.json() in app.ts
 */
import express, { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { NotFound } from '../../lib/errors.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { P } from '../rbac/permissions.js';
import { paymentProvider } from './providers.js';
import { applyEvent, getMyBilling } from './billing.service.js';

/** Must be mounted before the global JSON parser: providers sign the raw bytes. */
export const billingWebhookRouter = Router();
billingWebhookRouter.post('/:provider', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const provider = paymentProvider();
  if (req.params.provider !== provider.name) throw NotFound('Webhook');
  const event = await provider.parseWebhook(req, req.body as Buffer);
  await applyEvent(provider.name, event, JSON.parse((req.body as Buffer).toString('utf8')));
  res.json({ received: true });
});

export const billingRouter = Router();

billingRouter.get('/plans', async (_req, res) => {
  res.json(await prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceCents: 'asc' } }));
});

billingRouter.get('/me', authenticate, requirePermission(P.BILLING_READ_OWN), async (req, res) => {
  res.json({ billingEnabled: env.BILLING_ENABLED, ...(await getMyBilling(authOf(req).userId)) });
});

const CheckoutBody = z.object({ planKey: z.string().min(1).max(64) });

billingRouter.post('/checkout', authenticate, validate({ body: CheckoutBody }), async (req, res) => {
  const auth = authOf(req);
  const plan = await prisma.plan.findFirst({ where: { key: parsed(req, 'body', CheckoutBody).planKey, isActive: true } });
  if (!plan) throw NotFound('Plan');
  const result = await paymentProvider().createCheckout({
    userId: auth.userId,
    email: auth.email,
    planKey: plan.key,
    providerPriceRef: plan.providerPriceRef,
    successUrl: `${env.APP_URL}/billing?status=success`,
    cancelUrl: `${env.APP_URL}/billing?status=cancelled`,
  });
  res.json(result);
});

const PlanBody = z.object({
  key: z.string().regex(/^[a-z0-9-]{2,64}$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3).toUpperCase().default('USD'),
  interval: z.enum(['ONE_TIME', 'MONTH', 'YEAR']),
  features: z.array(z.string().max(64)).default([]),
  providerPriceRef: z.string().max(200).optional(),
});

billingRouter.post('/plans', authenticate, requirePermission(P.BILLING_MANAGE), validate({ body: PlanBody }), async (req, res) => {
  res.status(201).json(await prisma.plan.create({ data: parsed(req, 'body', PlanBody) }));
});
