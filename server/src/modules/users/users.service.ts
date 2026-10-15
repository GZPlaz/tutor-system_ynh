/**
 * Admin-side user management, including the APPROVAL half of onboarding:
 *
 *   PENDING ──approve──▶ ACTIVE ──suspend──▶ SUSPENDED ──reactivate──▶ ACTIVE
 *      │
 *      └────reject────▶ REJECTED
 *
 * Every transition is audited and emails the user via the outbox.
 */
import type { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js';
import { audit } from '../audit/audit.service.js';
import { enqueueEmail } from '../email/email.service.js';
import { invalidateUserAccess, setUserRoles } from '../rbac/rbac.service.js';
import { createPasswordToken } from '../auth/auth.service.js';
import { revokeAllSessions } from '../auth/tokens.js';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  timezone: true,
  status: true,
  createdAt: true,
  approvedAt: true,
  lastLoginAt: true,
  roles: { select: { role: { select: { key: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const present = (u: UserRow) => ({ ...u, roles: u.roles.map((r) => r.role) });

export async function listUsers(q: { status?: UserStatus; role?: string; search?: string; page: number; pageSize: number }) {
  const where: Prisma.UserWhereInput = {
    status: q.status,
    roles: q.role ? { some: { role: { key: q.role } } } : undefined,
    OR: q.search
      ? [
          { email: { contains: q.search, mode: 'insensitive' } },
          { firstName: { contains: q.search, mode: 'insensitive' } },
          { lastName: { contains: q.search, mode: 'insensitive' } },
        ]
      : undefined,
  };
  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: q.status === 'PENDING' ? { createdAt: 'asc' } : { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return { total, page: q.page, pageSize: q.pageSize, items: rows.map(present) };
}

export async function getUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!u) throw NotFound('User');
  return present(u);
}

async function requireStatus(id: string, allowed: UserStatus[]) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw NotFound('User');
  if (!allowed.includes(user.status)) {
    throw Conflict(`User is ${user.status.toLowerCase()}, expected ${allowed.join(' or ').toLowerCase()}`, 'INVALID_STATUS');
  }
  return user;
}

export async function approveUser(actorId: string, id: string, ip?: string) {
  const user = await requireStatus(id, ['PENDING', 'REJECTED']);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { status: 'ACTIVE', approvedAt: new Date(), approvedById: actorId, rejectionReason: null },
    });
    await enqueueEmail(user.email, 'account_approved', { firstName: user.firstName }, { tx });
  });
  await audit(actorId, 'user.approved', 'user', id, undefined, ip);
  return getUser(id);
}

export async function rejectUser(actorId: string, id: string, reason: string | undefined, ip?: string) {
  const user = await requireStatus(id, ['PENDING']);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: reason ?? null } });
    await enqueueEmail(user.email, 'account_rejected', { firstName: user.firstName, reason }, { tx });
  });
  await audit(actorId, 'user.rejected', 'user', id, { reason }, ip);
  return getUser(id);
}

export async function suspendUser(actorId: string, id: string, ip?: string) {
  if (actorId === id) throw BadRequest('You cannot suspend yourself');
  await requireStatus(id, ['ACTIVE']);
  await prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
  await revokeAllSessions(id); // takes effect immediately
  invalidateUserAccess(id);
  await audit(actorId, 'user.suspended', 'user', id, undefined, ip);
  return getUser(id);
}

export async function reactivateUser(actorId: string, id: string, ip?: string) {
  await requireStatus(id, ['SUSPENDED']);
  await prisma.user.update({ where: { id }, data: { status: 'ACTIVE' } });
  await audit(actorId, 'user.reactivated', 'user', id, undefined, ip);
  return getUser(id);
}

/**
 * Staff-created accounts (tutors, custom roles, or students you onboard
 * yourself) are ACTIVE immediately and receive a "set your password" link.
 */
export async function createUser(
  actorId: string,
  input: { email: string; firstName: string; lastName: string; timezone: string; roles: string[] },
) {
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    throw Conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }
  const user = await prisma.user.create({
    data: {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      timezone: input.timezone,
      status: 'ACTIVE',
      approvedAt: new Date(),
      approvedById: actorId,
    },
  });
  await setUserRoles(actorId, user.id, input.roles);

  const token = await createPasswordToken(user.id, env.INVITE_TTL_HOURS * 60);
  const roleNames = await prisma.role.findMany({ where: { key: { in: input.roles } }, select: { name: true } });
  await enqueueEmail(user.email, 'invite', {
    firstName: user.firstName,
    token,
    roleName: roleNames.map((r) => r.name).join(' / '),
    expiresInHours: env.INVITE_TTL_HOURS,
  });
  await audit(actorId, 'user.created', 'user', user.id, { roles: input.roles });
  return getUser(user.id);
}
