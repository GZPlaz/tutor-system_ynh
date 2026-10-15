/**
 * Resource Hub: tutors upload files or add links/videos, organise them into
 * folders + tags, and assign them to individual students or whole classes.
 *
 * Visibility rule (single source of truth: `canRead`):
 *   owner  OR  resources:manage_any  OR  assigned to me  OR  assigned to a class I'm in
 */
import type { Prisma, ResourceType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { Forbidden, NotFound } from '../../lib/errors.js';
import { audit } from '../audit/audit.service.js';
import { P } from '../rbac/permissions.js';
import { removeFile } from './storage.js';

type Auth = Express.AuthContext;

const assignedToUser = (userId: string): Prisma.ResourceWhereInput => ({
  assignments: {
    some: { OR: [{ studentId: userId }, { group: { members: { some: { userId } } } }] },
  },
});

export async function createResource(
  auth: Auth,
  input: {
    title: string;
    description?: string;
    type: ResourceType;
    url?: string;
    folder?: string;
    tags: string[];
    file?: { storageKey: string; originalName: string; mimeType: string; sizeBytes: number };
  },
) {
  const r = await prisma.resource.create({
    data: {
      ownerId: auth.userId,
      title: input.title,
      description: input.description,
      type: input.type,
      url: input.type === 'FILE' ? null : input.url,
      folder: input.folder,
      tags: input.tags,
      storageKey: input.file?.storageKey,
      originalName: input.file?.originalName,
      mimeType: input.file?.mimeType,
      sizeBytes: input.file?.sizeBytes,
    },
  });
  await audit(auth.userId, 'resource.created', 'resource', r.id);
  return r;
}

export async function listResources(
  auth: Auth,
  q: { view: 'library' | 'assigned'; folder?: string; tag?: string; search?: string },
) {
  const filters: Prisma.ResourceWhereInput = {
    folder: q.folder,
    tags: q.tag ? { has: q.tag } : undefined,
    title: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
  };

  const scope: Prisma.ResourceWhereInput =
    q.view === 'assigned'
      ? assignedToUser(auth.userId)
      : auth.can(P.RESOURCES_MANAGE_ANY)
        ? {}
        : { ownerId: auth.userId };

  return prisma.resource.findMany({
    where: { AND: [scope, filters] },
    include: {
      owner: { select: { firstName: true, lastName: true } },
      assignments: {
        select: {
          id: true,
          dueAt: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          group: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ folder: 'asc' }, { title: 'asc' }],
  });
}

async function loadOwned(auth: Auth, id: string) {
  const r = await prisma.resource.findUnique({ where: { id } });
  if (!r) throw NotFound('Resource');
  if (r.ownerId !== auth.userId && !auth.can(P.RESOURCES_MANAGE_ANY)) throw Forbidden();
  return r;
}

export async function canRead(auth: Auth, id: string) {
  const r = await prisma.resource.findFirst({
    where: {
      id,
      OR: auth.can(P.RESOURCES_MANAGE_ANY) ? undefined : [{ ownerId: auth.userId }, assignedToUser(auth.userId)],
    },
  });
  if (!r) throw NotFound('Resource'); // 404, not 403: don't reveal existence
  return r;
}

export async function updateResource(
  auth: Auth,
  id: string,
  data: { title?: string; description?: string | null; folder?: string | null; tags?: string[]; url?: string },
) {
  await loadOwned(auth, id);
  return prisma.resource.update({ where: { id }, data });
}

export async function deleteResource(auth: Auth, id: string) {
  const r = await loadOwned(auth, id);
  await prisma.resource.delete({ where: { id } });
  await removeFile(r.storageKey);
  await audit(auth.userId, 'resource.deleted', 'resource', id, { title: r.title });
}

export async function assignResource(
  auth: Auth,
  id: string,
  input: { studentIds: string[]; groupIds: string[]; dueAt?: Date },
) {
  await loadOwned(auth, id);
  if (!auth.can(P.RESOURCES_ASSIGN) && !auth.can(P.RESOURCES_MANAGE_ANY)) throw Forbidden();

  await prisma.resourceAssignment.createMany({
    data: [
      ...input.studentIds.map((studentId) => ({ resourceId: id, studentId, assignedById: auth.userId, dueAt: input.dueAt })),
      ...input.groupIds.map((groupId) => ({ resourceId: id, groupId, assignedById: auth.userId, dueAt: input.dueAt })),
    ],
    skipDuplicates: true,
  });
  await audit(auth.userId, 'resource.assigned', 'resource', id, input);
}

export async function unassign(auth: Auth, resourceId: string, assignmentId: string) {
  await loadOwned(auth, resourceId);
  await prisma.resourceAssignment.deleteMany({ where: { id: assignmentId, resourceId } });
}

// ---- Classes (groups) -------------------------------------------------------

export function listGroups(auth: Auth) {
  return prisma.group.findMany({
    where: auth.can(P.RESOURCES_MANAGE_ANY) ? {} : { ownerId: auth.userId },
    include: { members: { select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
    orderBy: { name: 'asc' },
  });
}

export function createGroup(auth: Auth, input: { name: string; description?: string }) {
  return prisma.group.create({ data: { ...input, ownerId: auth.userId } });
}

export async function setGroupMembers(auth: Auth, groupId: string, userIds: string[]) {
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (!g) throw NotFound('Class');
  if (g.ownerId !== auth.userId && !auth.can(P.RESOURCES_MANAGE_ANY)) throw Forbidden();
  await prisma.$transaction([
    prisma.groupMember.deleteMany({ where: { groupId } }),
    prisma.groupMember.createMany({ data: userIds.map((userId) => ({ groupId, userId })) }),
  ]);
}

export async function deleteGroup(auth: Auth, groupId: string) {
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (!g) throw NotFound('Class');
  if (g.ownerId !== auth.userId && !auth.can(P.RESOURCES_MANAGE_ANY)) throw Forbidden();
  await prisma.group.delete({ where: { id: groupId } });
}
