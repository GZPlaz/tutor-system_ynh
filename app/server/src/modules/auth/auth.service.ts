/**
 * Authentication + the student ONBOARDING / APPROVAL workflow.
 *
 *  register()  → user created with status PENDING + "student" role
 *               → email to the student ("received, pending approval")
 *               → email to every user holding users:approve
 *  login()     → only ACTIVE users get tokens; PENDING/REJECTED/SUSPENDED get a
 *               403 with a specific code the UI turns into a friendly screen
 *  approve/reject live in modules/users/users.service.ts (admin side).
 */
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError, BadRequest, Conflict, Forbidden, Unauthorized } from '../../lib/errors.js';
import { burnPasswordCheck, generateOpaqueToken, hashPassword, sha256, verifyPassword } from '../../lib/crypto.js';
import { enqueueEmail, enqueueToPermissionHolders } from '../email/email.service.js';
import { getAccessProfile } from '../rbac/rbac.service.js';
import { P, SELF_REGISTRATION_ROLE } from '../rbac/permissions.js';
import { audit } from '../audit/audit.service.js';
import { issueRefreshToken, revokeAllSessions, signAccessToken } from './tokens.js';
import { emailDomainAllowed, maintenanceMessage, settings } from '../settings/general.js';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export async function register(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  timezone: string;
}) {
  const rules = settings();
  if (rules.maintenance.enabled) throw new AppError(503, 'MAINTENANCE', maintenanceMessage());
  if (!rules.registration.open) {
    throw Forbidden('New accounts are by invitation only right now. Please contact us.', 'REGISTRATION_CLOSED');
  }
  if (!emailDomainAllowed(input.email, rules.registration.allowedEmailDomains)) {
    throw Forbidden(
      `Please sign up with an email address from: ${rules.registration.allowedEmailDomains.join(', ')}.`,
      'EMAIL_DOMAIN_NOT_ALLOWED',
    );
  }

  // Someone who booked as a guest may now create a real account with the same email;
  // their booking history carries over. A real account blocks the email.
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing && !existing.isGuest) throw Conflict('An account with this email already exists', 'EMAIL_TAKEN');

  const passwordHash = await hashPassword(input.password);
  const needsApproval = rules.registration.requireApproval;
  const status = needsApproval ? 'PENDING' : 'ACTIVE';
  const now = new Date();

  const user = await prisma.$transaction(async (tx) => {
    const fields = {
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      timezone: input.timezone,
      status,
      isGuest: false,
      approvedAt: needsApproval ? null : now,
    } as const;
    const created = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { ...fields, roles: { create: { role: { connect: { key: SELF_REGISTRATION_ROLE } } } } },
        })
      : await tx.user.create({
          data: { email: input.email, ...fields, roles: { create: { role: { connect: { key: SELF_REGISTRATION_ROLE } } } } },
        });

    // Emails are written in the same transaction as the user row.
    const who = { studentName: `${created.firstName} ${created.lastName}`, studentEmail: created.email };
    if (needsApproval) {
      await enqueueEmail(created.email, 'registration_received', { firstName: created.firstName }, { tx });
      if (rules.registration.notifyAdmins) await enqueueToPermissionHolders(P.USERS_APPROVE, 'admin_new_registration', who, tx);
    } else {
      await enqueueEmail(created.email, 'account_ready', { firstName: created.firstName }, { tx });
      if (rules.registration.notifyAdmins) await enqueueToPermissionHolders(P.USERS_APPROVE, 'admin_new_account', who, tx);
    }
    return created;
  });

  await audit(user.id, 'user.registered', 'user', user.id, { status, upgradedGuest: !!existing });
  return { id: user.id, email: user.email, status: user.status };
}

export async function login(input: { email: string; password: string }, meta: RequestMeta) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user || user.isGuest) {
    await burnPasswordCheck(input.password); // equalise timing → no user enumeration
    throw Unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= env.MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + env.LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    if (lock) await audit(user.id, 'user.locked_out', 'user', user.id, undefined, meta.ip);
    throw Unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
  }

  // Credentials are correct — now enforce the approval workflow.
  switch (user.status) {
    case 'PENDING':
      throw new AppError(403, 'ACCOUNT_PENDING', 'Your account is awaiting administrator approval.');
    case 'REJECTED':
      throw new AppError(403, 'ACCOUNT_REJECTED', 'Your registration was not approved.');
    case 'SUSPENDED':
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account is suspended. Contact support.');
  }

  // Maintenance mode: only people who manage settings may sign in.
  if (settings().maintenance.enabled) {
    const access = await getAccessProfile(user.id);
    if (!access.permissions.has(P.SETTINGS_MANAGE)) throw new AppError(503, 'MAINTENANCE', maintenanceMessage());
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const accessToken = signAccessToken(user.id, user.tokenVersion);
  const refreshToken = await issueRefreshToken(user.id, meta);
  return { accessToken, refreshToken, user: await getSessionUser(user.id) };
}

/** Shape returned to the SPA on login/refresh and from GET /auth/me. */
export async function getSessionUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true, timezone: true, status: true },
  });
  const access = await getAccessProfile(userId);
  return { ...user, roles: access.roles, permissions: [...access.permissions].sort() };
}

export async function issueAccessTokenFor(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true, tokenVersion: true } });
  if (user.status !== 'ACTIVE') throw new AppError(403, `ACCOUNT_${user.status}`, 'Account is not active');
  return signAccessToken(userId, user.tokenVersion);
}

// -----------------------------------------------------------------------------
// Password reset & invitations (same token mechanism)
// -----------------------------------------------------------------------------

export async function createPasswordToken(userId: string, ttlMinutes: number): Promise<string> {
  const raw = generateOpaqueToken();
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) },
  });
  return raw;
}

/** Always resolves (even for unknown emails) so attackers can't probe accounts. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.isGuest || user.status === 'REJECTED') return;
  const token = await createPasswordToken(user.id, env.PASSWORD_RESET_TTL_MIN);
  await enqueueEmail(user.email, 'password_reset', { token, expiresInMinutes: env.PASSWORD_RESET_TTL_MIN });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw BadRequest('This link is invalid or has expired. Request a new one.');
  }
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null },
    }),
  ]);
  await revokeAllSessions(record.userId); // sign out everywhere after a reset
  await audit(record.userId, 'user.password_reset', 'user', record.userId);
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, current))) throw BadRequest('Current password is incorrect');
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await revokeAllSessions(userId);
  await audit(userId, 'user.password_changed', 'user', userId);
}
