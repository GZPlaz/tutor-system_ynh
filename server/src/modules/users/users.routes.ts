/**
 * /api/users — administration of accounts and the approval queue.
 *
 *  GET   /                    list/search (?status=PENDING for the approval queue)
 *  GET   /:id
 *  POST  /                    create + invite (staff onboarding)
 *  POST  /:id/approve         PENDING → ACTIVE  (+ email)
 *  POST  /:id/reject          PENDING → REJECTED (+ email)
 *  POST  /:id/suspend         ACTIVE → SUSPENDED (revokes sessions)
 *  POST  /:id/reactivate      SUSPENDED → ACTIVE
 *  PUT   /:id/roles           replace role set
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { P } from '../rbac/permissions.js';
import { setUserRoles } from '../rbac/rbac.service.js';
import { EmailSchema, TimezoneSchema } from '../auth/auth.schemas.js';
import * as users from './users.service.js';

export const usersRouter = Router();
usersRouter.use(authenticate);

const IdParams = z.object({ id: z.string().uuid() });

const ListQuery = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']).optional(),
  role: z.string().max(64).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const CreateUserBody = z.object({
  email: EmailSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  timezone: TimezoneSchema.default('UTC'),
  roles: z.array(z.string().min(1)).min(1),
});

const RejectBody = z.object({ reason: z.string().trim().max(500).optional() });
const RolesBody = z.object({ roles: z.array(z.string().min(1)).min(1) });

usersRouter.get('/', requirePermission(P.USERS_READ), validate({ query: ListQuery }), async (req, res) => {
  res.json(await users.listUsers(parsed(req, 'query', ListQuery)));
});

usersRouter.get('/:id', requirePermission(P.USERS_READ), validate({ params: IdParams }), async (req, res) => {
  res.json(await users.getUser(parsed(req, 'params', IdParams).id));
});

usersRouter.post('/', requirePermission(P.USERS_MANAGE), validate({ body: CreateUserBody }), async (req, res) => {
  res.status(201).json(await users.createUser(authOf(req).userId, parsed(req, 'body', CreateUserBody)));
});

usersRouter.post('/:id/approve', requirePermission(P.USERS_APPROVE), validate({ params: IdParams }), async (req, res) => {
  res.json(await users.approveUser(authOf(req).userId, parsed(req, 'params', IdParams).id, req.ip));
});

usersRouter.post(
  '/:id/reject',
  requirePermission(P.USERS_APPROVE),
  validate({ params: IdParams, body: RejectBody }),
  async (req, res) => {
    const { id } = parsed(req, 'params', IdParams);
    res.json(await users.rejectUser(authOf(req).userId, id, parsed(req, 'body', RejectBody).reason, req.ip));
  },
);

usersRouter.post('/:id/suspend', requirePermission(P.USERS_MANAGE), validate({ params: IdParams }), async (req, res) => {
  res.json(await users.suspendUser(authOf(req).userId, parsed(req, 'params', IdParams).id, req.ip));
});

usersRouter.post('/:id/reactivate', requirePermission(P.USERS_MANAGE), validate({ params: IdParams }), async (req, res) => {
  res.json(await users.reactivateUser(authOf(req).userId, parsed(req, 'params', IdParams).id, req.ip));
});

usersRouter.put(
  '/:id/roles',
  requirePermission(P.USERS_MANAGE),
  validate({ params: IdParams, body: RolesBody }),
  async (req, res) => {
    const { id } = parsed(req, 'params', IdParams);
    await setUserRoles(authOf(req).userId, id, parsed(req, 'body', RolesBody).roles);
    res.json(await users.getUser(id));
  },
);
