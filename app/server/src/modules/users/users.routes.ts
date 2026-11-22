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
 *  PATCH /:id                 edit name, email, time zone (users:manage)
 *  POST  /:id/send-password-reset   email a reset link
 *  POST  /:id/sign-out-everywhere   revoke every session
 *  PUT   /:id/roles           replace role set
 *  DELETE /:id                delete the account (users:delete)
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

const BulkBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(['suspend', 'reactivate', 'send-password-reset', 'sign-out', 'unlock', 'add-role', 'remove-role']),
  roleKey: z.string().min(1).max(64).optional(),
});
usersRouter.post('/bulk', requirePermission(P.USERS_MANAGE), validate({ body: BulkBody }), async (req, res) => {
  const { ids, action, roleKey } = parsed(req, 'body', BulkBody);
  res.json(await users.bulk(authOf(req).userId, ids, action, roleKey, req.ip));
});

usersRouter.get('/:id/overview', requirePermission(P.USERS_READ), validate({ params: IdParams }), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await users.userOverview(authOf(req), parsed(req, 'params', IdParams).id));
});

usersRouter.post('/:id/unlock', requirePermission(P.USERS_MANAGE), validate({ params: IdParams }), async (req, res) => {
  await users.unlockUser(authOf(req).userId, parsed(req, 'params', IdParams).id, req.ip);
  res.status(204).end();
});

usersRouter.post('/:id/reset-tour', requirePermission(P.USERS_MANAGE), validate({ params: IdParams }), async (req, res) => {
  await users.resetTour(authOf(req).userId, parsed(req, 'params', IdParams).id, req.ip);
  res.status(204).end();
});

usersRouter.post(
  '/:id/cancel-upcoming',
  requirePermission(P.BOOKINGS_MANAGE_ANY),
  validate({ params: IdParams, body: z.object({ reason: z.string().trim().min(3).max(500) }) }),
  async (req, res) => {
    res.json(await users.cancelUpcomingFor(authOf(req).userId, parsed(req, 'params', IdParams).id, (req.valid.body as { reason: string }).reason, req.ip));
  },
);

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

const UpdateUserBody = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    email: EmailSchema.optional(),
    timezone: TimezoneSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' });

usersRouter.patch('/:id', requirePermission(P.USERS_MANAGE), validate({ params: IdParams, body: UpdateUserBody }), async (req, res) => {
  res.json(await users.updateUser(authOf(req).userId, parsed(req, 'params', IdParams).id, parsed(req, 'body', UpdateUserBody), req.ip));
});

usersRouter.post('/:id/send-password-reset', requirePermission(P.USERS_MANAGE), validate({ params: IdParams }), async (req, res) => {
  res.json(await users.sendPasswordReset(authOf(req).userId, parsed(req, 'params', IdParams).id, req.ip));
});

usersRouter.post('/:id/sign-out-everywhere', requirePermission(P.USERS_MANAGE), validate({ params: IdParams }), async (req, res) => {
  await users.signOutEverywhere(authOf(req).userId, parsed(req, 'params', IdParams).id, req.ip);
  res.status(204).end();
});

usersRouter.delete('/:id', requirePermission(P.USERS_DELETE), validate({ params: IdParams }), async (req, res) => {
  res.json(await users.deleteUser(authOf(req).userId, parsed(req, 'params', IdParams).id, req.ip));
});
