/**
 * /api/legal   (signed in)
 *   POST   /accept              { acceptTerms: true, age }  accept the current Terms & Privacy Policy
 *   GET    /export              download a JSON copy of your personal data
 *   POST   /deletion-request    { reason? }  ask for your account to be deleted
 *   DELETE /deletion-request    withdraw that request
 *
 * The operator details shown on the legal pages come from GET /api/config (`legal`).
 */
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { ConsentFields } from '../auth/auth.schemas.js';
import * as svc from './legal.service.js';

export const legalRouter = Router();
legalRouter.use(authenticate);

const exportLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => authOf(req).userId,
  message: { error: { code: 'RATE_LIMITED', message: 'You have downloaded your data several times recently. Please try again later.' } },
});

const AcceptBody = z.object(ConsentFields);
legalRouter.post('/accept', validate({ body: AcceptBody }), async (req, res) => {
  const { age } = parsed(req, 'body', AcceptBody);
  res.json(await svc.acceptTerms(authOf(req).userId, age, req.ip));
});

legalRouter.get('/export', exportLimiter, async (req, res) => {
  const data = await svc.exportUserData(authOf(req).userId, req.ip);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`);
  res.type('application/json').send(JSON.stringify(data, null, 2));
});

const DeletionBody = z.object({ reason: z.string().trim().max(1000).optional() });
legalRouter.post('/deletion-request', validate({ body: DeletionBody }), async (req, res) => {
  const { reason } = parsed(req, 'body', DeletionBody);
  res.json(await svc.requestDeletion(authOf(req).userId, reason || undefined, req.ip));
});

legalRouter.delete('/deletion-request', async (req, res) => {
  await svc.cancelDeletionRequest(authOf(req).userId, req.ip);
  res.status(204).end();
});
