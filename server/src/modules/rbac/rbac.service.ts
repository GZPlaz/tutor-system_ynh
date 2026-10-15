/**
 * RBAC engine: permission resolution (with a small in-process cache), boot-time
 * catalog sync, and role CRUD used by the admin role editor.
 *
 * Scaling note: the cache is per-process. If you ever run several API
 * instances, replace `cache` with Redis (same get/set/invalidate interface).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js';
import { audit } from '../audit/audit.service.js';
import { PERMISSIONS, SYSTEM_ROLES, ALL_PERMISSION_KEYS, type SystemRoleKey } from './permissions.js';

// -----------------------------------------------------------------------------
// Effective-permission cache
// -----------------------------------------------------------------------------

export interface AccessProfile {
  roles: string[]; // role keys
  permissions: Set<string>;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: AccessProfile; expires: number }>();

export function invalidateUserAccess(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear(); // role definition changed → everyone may be affected
}

/** Union of all permissions across every role the user holds. */
export async function getAccessProfile(userId: string): Promise<AccessProfile> {
  const hit = cache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.value;

  const rows = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          key: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });

  const value: AccessProfile = {
    roles: rows.map((r) => r.role.key),
    permissions: new Set(rows.flatMap((r) => r.role.permissions.map((rp) => rp.permission.key))),
  };
  cache.set(userId, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

// -----------------------------------------------------------------------------
// Boot-time sync: code catalog → database
// -----------------------------------------------------------------------------

/**
 * Idempotent. Runs on every start:
 *  - upserts every permission in the catalog (and removes ones deleted from code)
 *  - ensures the three system roles exist, seeding their default permissions
 *    only when the role is first created
 *  - re-grants ALL permissions to `admin` so new features are never locked out
 */
export async function syncRbac(): Promise<void> {
  const defs = Object.values(PERMISSIONS);

  await prisma.$transaction(async (tx) => {
    for (const p of defs) {
      await tx.permission.upsert({
        where: { key: p.key },
        create: { key: p.key, category: p.category, description: p.description },
        update: { category: p.category, description: p.description },
      });
    }
    const removed = await tx.permission.deleteMany({ where: { key: { notIn: ALL_PERMISSION_KEYS } } });
    if (removed.count) logger.warn({ count: removed.count }, 'Removed permissions no longer in catalog');

    const permByKey = new Map((await tx.permission.findMany()).map((p) => [p.key, p.id]));

    for (const [key, def] of Object.entries(SYSTEM_ROLES) as [SystemRoleKey, (typeof SYSTEM_ROLES)[SystemRoleKey]][]) {
      const existing = await tx.role.findUnique({ where: { key } });
      const role =
        existing ??
        (await tx.role.create({
          data: { key, name: def.name, description: def.description, isSystem: true },
        }));

      const shouldSeed = !existing || key === 'admin';
      if (shouldSeed) {
        await tx.rolePermission.createMany({
          data: (def.permissions as readonly string[]).map((pk) => ({ roleId: role.id, permissionId: permByKey.get(pk)! })),
          skipDuplicates: true,
        });
      }
    }
  });

  invalidateUserAccess();
  logger.info({ permissions: defs.length }, 'RBAC catalog synced');
}

// -----------------------------------------------------------------------------
// Role administration
// -----------------------------------------------------------------------------

const roleInclude = {
  permissions: { select: { permission: { select: { key: true } } } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

function presentRole(r: RoleRow) {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissions: r.permissions.map((p) => p.permission.key).sort(),
    userCount: r._count.users,
  };
}

function assertKnownPermissions(keys: string[]) {
  const unknown = keys.filter((k) => !ALL_PERMISSION_KEYS.includes(k as never));
  if (unknown.length) throw BadRequest('Unknown permission keys', { unknown });
}

export async function listPermissions() {
  return prisma.permission.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
}

export async function listRoles() {
  const roles = await prisma.role.findMany({ include: roleInclude, orderBy: { name: 'asc' } });
  return roles.map(presentRole);
}

export async function createRole(
  actorId: string,
  input: { key: string; name: string; description?: string; permissions: string[] },
) {
  assertKnownPermissions(input.permissions);
  if (await prisma.role.findUnique({ where: { key: input.key } })) {
    throw Conflict(`A role with key "${input.key}" already exists`);
  }
  const role = await prisma.role.create({
    data: {
      key: input.key,
      name: input.name,
      description: input.description,
      permissions: {
        create: input.permissions.map((key) => ({ permission: { connect: { key } } })),
      },
    },
    include: roleInclude,
  });
  await audit(actorId, 'role.created', 'role', role.id, { key: role.key, permissions: input.permissions });
  return presentRole(role);
}

export async function updateRole(
  actorId: string,
  roleId: string,
  input: { name?: string; description?: string | null; permissions?: string[] },
) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw NotFound('Role');
  if (role.key === 'admin' && input.permissions) {
    throw BadRequest('The administrator role always has every permission');
  }
  if (input.permissions) assertKnownPermissions(input.permissions);

  const updated = await prisma.$transaction(async (tx) => {
    if (input.permissions) {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      const perms = await tx.permission.findMany({ where: { key: { in: input.permissions } } });
      await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) });
    }
    return tx.role.update({
      where: { id: roleId },
      data: { name: input.name, description: input.description },
      include: roleInclude,
    });
  });

  invalidateUserAccess();
  await audit(actorId, 'role.updated', 'role', roleId, input);
  return presentRole(updated);
}

export async function deleteRole(actorId: string, roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
  if (!role) throw NotFound('Role');
  if (role.isSystem) throw BadRequest('System roles cannot be deleted');
  if (role._count.users > 0) throw Conflict('Reassign users before deleting this role', 'ROLE_IN_USE');
  await prisma.role.delete({ where: { id: roleId } });
  invalidateUserAccess();
  await audit(actorId, 'role.deleted', 'role', roleId, { key: role.key });
}

/** Replace a user's role set. Guards against removing the last administrator. */
export async function setUserRoles(actorId: string, userId: string, roleKeys: string[]) {
  const roles = await prisma.role.findMany({ where: { key: { in: roleKeys } } });
  if (roles.length !== new Set(roleKeys).size) throw BadRequest('One or more roles do not exist');

  if (!roleKeys.includes('admin')) {
    const otherAdmins = await prisma.userRole.count({
      where: { role: { key: 'admin' }, userId: { not: userId }, user: { status: 'ACTIVE' } },
    });
    const isAdmin = await prisma.userRole.count({ where: { userId, role: { key: 'admin' } } });
    if (isAdmin && otherAdmins === 0) throw Conflict('Cannot remove the last active administrator', 'LAST_ADMIN');
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userRole.createMany({ data: roles.map((r) => ({ userId, roleId: r.id, assignedById: actorId })) }),
  ]);
  invalidateUserAccess(userId);
  await audit(actorId, 'user.roles_changed', 'user', userId, { roles: roleKeys });
}
