/**
 * /api/reports
 *   POST /               { tutorId, bookingId?, category, details }   any signed-in person
 *   GET  /?status&tutorId                                             safety:manage
 *   PATCH /:id           { status?, adminNote? }                      safety:manage
 */
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { P } from '../rbac/permissions.js';
import * as svc from './reports.service.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

const Uuid = z.string().uuid();
const Category = z.enum(['SAFETY', 'CONDUCT', 'NO_SHOW', 'QUALITY', 'OTHER']);
const Status = z.enum(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED']);

const fileLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? 'anonymous',
  message: { error: { code: 'RATE_LIMITED', message: 'You have sent several reports recently. Please wait an hour, or contact the team directly.' } },
});

const FileBody = z.object({
  tutorId: Uuid,
  bookingId: Uuid.optional(),
  category: Category,
  details: z.string().trim().min(10, 'Please describe what happened (at least a sentence).').max(4000),
});
reportsRouter.post('/', fileLimiter, validate({ body: FileBody }), async (req, res) => {
  res.status(201).json(await svc.fileReport(authOf(req), parsed(req, 'body', FileBody)));
});

const ListQuery = z.object({ status: Status.optional(), tutorId: Uuid.optional() });
reportsRouter.get('/', requirePermission(P.SAFETY_MANAGE), validate({ query: ListQuery }), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await svc.listReports(parsed(req, 'query', ListQuery)));
});

const UpdateBody = z.object({ status: Status.optional(), adminNote: z.string().trim().max(4000).nullable().optional() });
reportsRouter.patch('/:id', requirePermission(P.SAFETY_MANAGE), validate({ params: z.object({ id: Uuid }), body: UpdateBody }), async (req, res) => {
  await svc.updateReport(authOf(req), (req.valid.params as { id: string }).id, parsed(req, 'body', UpdateBody));
  res.status(204).end();
});
