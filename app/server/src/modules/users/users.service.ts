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
import { createPasswordToken, sendPasswordResetTo } from '../auth/auth.service.js';
import { revokeAllSessions } from '../auth/tokens.js';
import { bookingInclude, cancelMany } from '../scheduling/scheduling.service.js';
import { removeFile } from '../resources/storage.js';

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
    deletedAt: null,
    isGuest: false, // people who booked without an account are not part of the directory
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
  const u = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
  if (!u) throw NotFound('User');
  return present(u);
}

async function requireStatus(id: string, allowed: UserStatus[]) {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
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

/** Admin edit of someone's details. Changing the email signs them out everywhere. */
export async function updateUser(
  actorId: string,
  id: string,
  data: { firstName?: string; lastName?: string; email?: string; timezone?: string },
  ip?: string,
) {
  const before = await prisma.user.findUnique({ where: { id }, select: { email: true, deletedAt: true, isGuest: true } });
  if (!before || before.deletedAt) throw NotFound('User');
  if (data.email && data.email !== before.email) {
    const taken = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (taken) throw Conflict('Another account already uses that email address', 'EMAIL_TAKEN');
  }
  await prisma.user.update({ where: { id }, data });
  if (data.email && data.email !== before.email) await revokeAllSessions(id);
  await audit(actorId, 'user.updated', 'user', id, { ...data, previousEmail: data.email && data.email !== before.email ? before.email : undefined }, ip);
  return getUser(id);
}

export async function sendPasswordReset(actorId: string, id: string, ip?: string) {
  const { email } = await sendPasswordResetTo(id);
  await audit(actorId, 'user.password_reset_sent', 'user', id, undefined, ip);
  return { email };
}

export async function signOutEverywhere(actorId: string, id: string, ip?: string) {
  await revokeAllSessions(id);
  await audit(actorId, 'user.signed_out_everywhere', 'user', id, undefined, ip);
}

// ---- admin control panel -----------------------------------------------------------

/** Everything an admin needs on one person's page. */
export async function userOverview(viewer: Express.AuthContext, id: string) {
  const u = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...userSelect,
      isGuest: true, failedLoginCount: true, lockedUntil: true, tourCompletedAt: true,
      emailOnMessage: true, emailReminders: true, rejectionReason: true,
      approvedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!u) throw NotFound('User');
  const now = new Date();
  const [asStudent, asTutor, upcoming, reports, notes, activity] = await Promise.all([
    prisma.booking.groupBy({ by: ['status'], where: { studentId: id }, _count: { _all: true } }),
    prisma.booking.groupBy({ by: ['status'], where: { tutorId: id }, _count: { _all: true } }),
    prisma.booking.findMany({
      where: { OR: [{ studentId: id }, { tutorId: id }], status: { in: ['PENDING', 'CONFIRMED'] }, endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
      take: 10,
      select: { id: true, startsAt: true, status: true, service: { select: { name: true } }, studentId: true, student: { select: { firstName: true, lastName: true } }, tutor: { select: { firstName: true, lastName: true } } },
    }),
    viewer.can('safety:manage')
      ? prisma.tutorReport.findMany({ where: { tutorId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, category: true, status: true, createdAt: true } })
      : Promise.resolve(null),
    prisma.studentNote.count({ where: { studentId: id } }),
    viewer.can('audit:read')
      ? prisma.auditLog.findMany({
          where: { OR: [{ entityId: id }, { actorId: id }] },
          orderBy: { createdAt: 'desc' },
          take: 25,
          select: { id: true, action: true, createdAt: true, actorId: true, actor: { select: { firstName: true, lastName: true } } },
        })
      : Promise.resolve(null),
  ]);
  const tally = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  const { approvedBy, ...rest } = u;
  return {
    user: { ...present(rest as UserRow), isGuest: u.isGuest, failedLoginCount: u.failedLoginCount, lockedUntil: u.lockedUntil && u.lockedUntil > now ? u.lockedUntil : null,
      tourCompletedAt: u.tourCompletedAt, preferences: { emailOnMessage: u.emailOnMessage, emailReminders: u.emailReminders },
      rejectionReason: u.rejectionReason, approvedBy: approvedBy ? `${approvedBy.firstName} ${approvedBy.lastName}` : null },
    sessions: { asStudent: tally(asStudent), asTutor: tally(asTutor) },
    upcoming: upcoming.map((b) => ({ id: b.id, startsAt: b.startsAt, status: b.status, service: b.service.name, role: b.studentId === id ? 'student' : 'tutor',
      with: b.studentId === id ? `${b.tutor.firstName} ${b.tutor.lastName}` : `${b.student.firstName} ${b.student.lastName}` })),
    reports,
    notes,
    activity: activity?.map((a) => ({ id: a.id, action: a.action, at: a.createdAt, byThem: a.actorId === id, actor: a.actor ? `${a.actor.firstName} ${a.actor.lastName}` : 'System' })) ?? null,
  };
}

/** Clear a lock-out after too many wrong passwords. */
export async function unlockUser(actorId: string, id: string, ip?: string) {
  await prisma.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await audit(actorId, 'user.unlocked', 'user', id, undefined, ip);
}

export async function resetTour(actorId: string, id: string, ip?: string) {
  await prisma.user.update({ where: { id }, data: { tourCompletedAt: null } });
  await audit(actorId, 'user.tour_reset', 'user', id, undefined, ip);
}

/** Cancel every upcoming session someone is in (e.g. when pausing a tutor). Everyone is emailed. */
export async function cancelUpcomingFor(actorId: string, id: string, reason: string, ip?: string) {
  const upcoming = await prisma.booking.findMany({
    where: { OR: [{ studentId: id }, { tutorId: id }], status: { in: ['PENDING', 'CONFIRMED'] }, endedAt: null, endsAt: { gt: new Date() } },
    include: bookingInclude,
  });
  await cancelMany(actorId, upcoming, reason);
  await audit(actorId, 'user.sessions_cancelled', 'user', id, { count: upcoming.length, reason }, ip);
  return { cancelled: upcoming.length };
}

export type BulkAction = 'suspend' | 'reactivate' | 'send-password-reset' | 'sign-out' | 'unlock' | 'add-role' | 'remove-role';

/** Apply one action to many people; each person succeeds or fails on their own. */
export async function bulk(actorId: string, ids: string[], action: BulkAction, roleKey?: string, ip?: string) {
  const done: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of ids) {
    try {
      if (action === 'suspend') await suspendUser(actorId, id, ip);
      else if (action === 'reactivate') await reactivateUser(actorId, id, ip);
      else if (action === 'send-password-reset') await sendPasswordReset(actorId, id, ip);
      else if (action === 'sign-out') await signOutEverywhere(actorId, id, ip);
      else if (action === 'unlock') await unlockUser(actorId, id, ip);
      else {
        if (!roleKey) throw BadRequest('Choose a role');
        const current = await prisma.userRole.findMany({ where: { userId: id }, select: { role: { select: { key: true } } } });
        const keys = new Set(current.map((r) => r.role.key));
        if (action === 'add-role') keys.add(roleKey);
        else keys.delete(roleKey);
        if (!keys.size) throw BadRequest('Everyone needs at least one role');
        if (id === actorId && action === 'remove-role' && roleKey === 'admin') throw BadRequest("You can't remove your own admin role");
        await setUserRoles(actorId, id, [...keys]);
      }
      done.push(id);
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : 'Failed' });
    }
  }
  return { done: done.length, failed };
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
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing && !existing.isGuest) throw Conflict('An account with this email already exists', 'EMAIL_TAKEN');
  const fields = {
    firstName: input.firstName,
    lastName: input.lastName,
    timezone: input.timezone,
    status: 'ACTIVE',
    isGuest: false,
    approvedAt: new Date(),
    approvedById: actorId,
  } as const;
  // An invited person who earlier booked as a guest keeps their booking history.
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: fields })
    : await prisma.user.create({ data: { email: input.email, ...fields } });
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

/**
 * DELETE AN ACCOUNT
 *  1. Upcoming sessions involving the person are cancelled (both sides emailed).
 *  2. Their own content goes: availability, classes they own, resources they
 *     uploaded (files too), sign-in tokens, roles.
 *  3. If nothing else refers to them (no past sessions, nor payment records
 *     from when the site used to charge) the row is removed entirely. Otherwise the row is kept as
 *     "Deleted user" with every personal detail scrubbed, so the other
 *     person's session history and financial records stay intact.
 * Either way the email address is freed and the person can never sign in.
 */
export async function deleteUser(actorId: string, id: string, ip?: string) {
  if (actorId === id) throw BadRequest('You cannot delete your own account');
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, include: { roles: { include: { role: true } } } });
  if (!user) throw NotFound('User');

  if (user.roles.some((r) => r.role.key === 'admin')) {
    const otherAdmins = await prisma.userRole.count({
      where: { role: { key: 'admin' }, userId: { not: id }, user: { status: 'ACTIVE', deletedAt: null } },
    });
    if (otherAdmins === 0) throw Conflict('You cannot delete the last administrator', 'LAST_ADMIN');
  }

  // 1. Cancel what's still ahead.
  const upcoming = await prisma.booking.findMany({
    where: { OR: [{ studentId: id }, { tutorId: id }], status: { in: ['PENDING', 'CONFIRMED'] }, endedAt: null, endsAt: { gt: new Date() } },
    include: bookingInclude,
  });
  await cancelMany(actorId, upcoming, 'This account was removed');

  // 2. Their own content.
  const files = await prisma.resource.findMany({ where: { ownerId: id }, select: { storageKey: true } });
  await prisma.$transaction([
    prisma.resource.deleteMany({ where: { ownerId: id } }),
    prisma.group.deleteMany({ where: { ownerId: id } }),
    prisma.availabilityRule.deleteMany({ where: { tutorId: id } }),
    prisma.availabilityException.deleteMany({ where: { tutorId: id } }),
    prisma.tutorService.deleteMany({ where: { tutorId: id } }),
    prisma.groupMember.deleteMany({ where: { userId: id } }),
    prisma.resourceAssignment.deleteMany({ where: { studentId: id } }),
    prisma.refreshToken.deleteMany({ where: { userId: id } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
    prisma.userRole.deleteMany({ where: { userId: id } }),
  ]);
  for (const f of files) await removeFile(f.storageKey);

  // 3. Remove completely, or keep a scrubbed placeholder for shared history.
  //    (Payment records from when the site charged for sessions are history too.)
  const [bookings, payments, subscriptions] = await Promise.all([
    prisma.booking.count({ where: { OR: [{ studentId: id }, { tutorId: id }] } }),
    prisma.payment.count({ where: { userId: id } }),
    prisma.subscription.count({ where: { userId: id } }),
  ]);
  const keep = bookings + payments + subscriptions > 0;
  if (keep) {
    await prisma.user.update({
      where: { id },
      data: {
        email: `deleted-${id}@deleted.invalid`,
        firstName: 'Deleted',
        lastName: 'user',
        passwordHash: null,
        status: 'SUSPENDED',
        rejectionReason: null,
        timezone: 'UTC',
        deletedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
  } else {
    await prisma.user.delete({ where: { id } });
  }
  invalidateUserAccess(id);
  // The audit entry deliberately records no name or email.
  await audit(actorId, 'user.deleted', 'user', id, { cancelledSessions: upcoming.length, keptHistory: keep }, ip);
  return { mode: keep ? 'anonymized' : 'deleted', cancelledSessions: upcoming.length };
}
