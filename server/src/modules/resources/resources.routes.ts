/**
 * /api/resources
 *   GET    /?view=library|assigned&folder&tag&search
 *   POST   /                       multipart/form-data (field "file") or JSON for links
 *   PATCH  /:id
 *   DELETE /:id
 *   GET    /:id/download           streams the file if the caller may read it
 *   POST   /:id/assign             { studentIds[], groupIds[], dueAt? }
 *   DELETE /:id/assignments/:assignmentId
 *
 * /api/groups  (classes)
 *   GET / · POST / · PUT /:id/members · DELETE /:id
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { BadRequest } from '../../lib/errors.js';
import { P } from '../rbac/permissions.js';
import { absolutePath, removeFile, upload } from './storage.js';
import * as svc from './resources.service.js';

export const resourcesRouter = Router();
resourcesRouter.use(authenticate);

const Uuid = z.string().uuid();
const IdParams = z.object({ id: Uuid });
const HttpsUrl = z.string().trim().url().refine((u) => u.startsWith('https://'), 'Links must use https://');

/** Multipart fields arrive as strings, so tags may be "a, b, c". */
const Tags = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((v) =>
    v === undefined
      ? undefined // PATCH without tags must not wipe existing tags
      : (Array.isArray(v) ? v : v.split(',')).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
  );

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  type: z.enum(['FILE', 'LINK', 'VIDEO']),
  url: HttpsUrl.optional(),
  folder: z.string().trim().max(200).optional(),
  tags: Tags,
});

const ListQuery = z.object({
  view: z.enum(['library', 'assigned']).default('assigned'),
  folder: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  search: z.string().max(100).optional(),
});

resourcesRouter.get(
  '/',
  requireAnyPermission(P.RESOURCES_READ_ASSIGNED, P.RESOURCES_CREATE, P.RESOURCES_MANAGE_ANY),
  validate({ query: ListQuery }),
  async (req, res) => {
    res.json(await svc.listResources(authOf(req), parsed(req, 'query', ListQuery)));
  },
);

resourcesRouter.post(
  '/',
  requirePermission(P.RESOURCES_CREATE),
  upload.single('file'), // no-op for JSON requests
  async (req, res) => {
    try {
      validate({ body: CreateBody })(req, res, () => undefined);
      const body = parsed(req, 'body', CreateBody);
      if (body.type === 'FILE' && !req.file) throw BadRequest('Attach a file for type FILE');
      if (body.type !== 'FILE' && !body.url) throw BadRequest('A URL is required for links and videos');
      if (body.type !== 'FILE' && req.file) throw BadRequest('Do not attach a file to a link or video');

      const resource = await svc.createResource(authOf(req), {
        ...body,
        tags: body.tags ?? [],
        file: req.file
          ? { storageKey: req.file.filename, originalName: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size }
          : undefined,
      });
      res.status(201).json(resource);
    } catch (err) {
      // Multer already wrote the file to disk; don't leave orphans behind.
      await removeFile(req.file?.filename);
      throw err;
    }
  },
);

const UpdateBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  folder: z.string().trim().max(200).nullable().optional(),
  tags: Tags,
  url: HttpsUrl.optional(),
});

resourcesRouter.patch('/:id', validate({ params: IdParams, body: UpdateBody }), async (req, res) => {
  res.json(await svc.updateResource(authOf(req), parsed(req, 'params', IdParams).id, parsed(req, 'body', UpdateBody)));
});

resourcesRouter.delete('/:id', validate({ params: IdParams }), async (req, res) => {
  await svc.deleteResource(authOf(req), parsed(req, 'params', IdParams).id);
  res.status(204).end();
});

resourcesRouter.get('/:id/download', validate({ params: IdParams }), async (req, res) => {
  const r = await svc.canRead(authOf(req), parsed(req, 'params', IdParams).id);
  if (r.type !== 'FILE' || !r.storageKey) throw BadRequest('This resource is a link, not a file');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(absolutePath(r.storageKey), r.originalName ?? 'download');
});

const AssignBody = z
  .object({
    studentIds: z.array(Uuid).default([]),
    groupIds: z.array(Uuid).default([]),
    dueAt: z.coerce.date().optional(),
  })
  .refine((b) => b.studentIds.length + b.groupIds.length > 0, { message: 'Choose at least one student or class' });

resourcesRouter.post(
  '/:id/assign',
  requireAnyPermission(P.RESOURCES_ASSIGN, P.RESOURCES_MANAGE_ANY),
  validate({ params: IdParams, body: AssignBody }),
  async (req, res) => {
    await svc.assignResource(authOf(req), parsed(req, 'params', IdParams).id, parsed(req, 'body', AssignBody));
    res.status(204).end();
  },
);

resourcesRouter.delete(
  '/:id/assignments/:assignmentId',
  validate({ params: z.object({ id: Uuid, assignmentId: Uuid }) }),
  async (req, res) => {
    const { id, assignmentId } = req.valid.params as { id: string; assignmentId: string };
    await svc.unassign(authOf(req), id, assignmentId);
    res.status(204).end();
  },
);

// ---- Classes ----------------------------------------------------------------

export const groupsRouter = Router();
groupsRouter.use(authenticate, requirePermission(P.GROUPS_MANAGE));

groupsRouter.get('/', async (req, res) => {
  res.json(await svc.listGroups(authOf(req)));
});

const GroupBody = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).optional() });

groupsRouter.post('/', validate({ body: GroupBody }), async (req, res) => {
  res.status(201).json(await svc.createGroup(authOf(req), parsed(req, 'body', GroupBody)));
});

groupsRouter.put(
  '/:id/members',
  validate({ params: IdParams, body: z.object({ userIds: z.array(Uuid).max(500) }) }),
  async (req, res) => {
    const { userIds } = req.valid.body as { userIds: string[] };
    await svc.setGroupMembers(authOf(req), parsed(req, 'params', IdParams).id, userIds);
    res.status(204).end();
  },
);

groupsRouter.delete('/:id', validate({ params: IdParams }), async (req, res) => {
  await svc.deleteGroup(authOf(req), parsed(req, 'params', IdParams).id);
  res.status(204).end();
});
