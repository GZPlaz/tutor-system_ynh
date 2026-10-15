/**
 * /api/rbac — the dynamic role editor behind the admin "Roles" screen.
 *
 *  GET    /permissions    full catalog grouped by category (checkbox list)
 *  GET    /roles          roles with their permission keys + user counts
 *  POST   /roles          create a custom role { key, name, description, permissions[] }
 *  PATCH  /roles/:id      rename / change permission set
 *  DELETE /roles/:id      custom roles only, and only when unused
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { P } from './permissions.js';
import * as rbac from './rbac.service.js';

export const rbacRouter = Router();
rbacRouter.use(authenticate, requirePermission(P.ROLES_MANAGE));

const IdParams = z.object({ id: z.string().uuid() });

const CreateRoleBody = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{1,40}$/, 'Use lowercase letters, numbers and dashes'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string()).default([]),
});

const UpdateRoleBody = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(z.string()).optional(),
});

rbacRouter.get('/permissions', async (_req, res) => {
  const perms = await rbac.listPermissions();
  const grouped: Record<string, { key: string; description: string }[]> = {};
  for (const p of perms) (grouped[p.category] ??= []).push({ key: p.key, description: p.description });
  res.json(grouped);
});

rbacRouter.get('/roles', async (_req, res) => {
  res.json(await rbac.listRoles());
});

rbacRouter.post('/roles', validate({ body: CreateRoleBody }), async (req, res) => {
  res.status(201).json(await rbac.createRole(authOf(req).userId, parsed(req, 'body', CreateRoleBody)));
});

rbacRouter.patch('/roles/:id', validate({ params: IdParams, body: UpdateRoleBody }), async (req, res) => {
  const { id } = parsed(req, 'params', IdParams);
  res.json(await rbac.updateRole(authOf(req).userId, id, parsed(req, 'body', UpdateRoleBody)));
});

rbacRouter.delete('/roles/:id', validate({ params: IdParams }), async (req, res) => {
  await rbac.deleteRole(authOf(req).userId, parsed(req, 'params', IdParams).id);
  res.status(204).end();
});
