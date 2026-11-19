/** /api/audit — read-only audit log for administrators. */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { P } from '../rbac/permissions.js';
import { listAuditLogs } from './audit.service.js';

export const auditRouter = Router();

const Query = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

auditRouter.get('/', authenticate, requirePermission(P.AUDIT_READ), validate({ query: Query }), async (req, res) => {
  res.json(await listAuditLogs(parsed(req, 'query', Query)));
});
