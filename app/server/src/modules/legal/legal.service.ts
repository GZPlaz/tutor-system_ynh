/**
 * Privacy rights a signed-in person can use themselves (Profile → Your data):
 *   - accept the current Terms (after they change)
 *   - download a copy of their personal data (right of access / portability)
 *   - ask for their account to be deleted (right to erasure); administrators with
 *     `users:delete` are emailed and carry it out with the existing Delete account.
 */
import { prisma } from '../../lib/prisma.js';
import { BadRequest } from '../../lib/errors.js';
import { audit } from '../audit/audit.service.js';
import { enqueueEmail, enqueueToPermissionHolders } from '../email/email.service.js';
import { P } from '../rbac/permissions.js';
import { settings } from '../settings/general.js';
import { consentRecord, type AgeConfirmation } from './consent.js';

export async function acceptTerms(userId: string, age: AgeConfirmation, ip?: string) {
  const record = consentRecord(age);
  await prisma.user.update({ where: { id: userId }, data: record });
  await audit(userId, 'legal.terms_accepted', 'user', userId, { termsVersion: record.termsVersion, guardianConsent: record.guardianConsent }, ip);
  return { termsVersion: record.termsVersion, termsAcceptedAt: record.termsAcceptedAt };
}

const person = { select: { firstName: true, lastName: true } } as const;
const name = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : null);

/** Everything held about the person, in a readable JSON document. */
export async function exportUserData(userId: string, ip?: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, email: true, firstName: true, lastName: true, timezone: true, status: true, createdAt: true,
      approvedAt: true, lastLoginAt: true, emailOnMessage: true, emailReminders: true, tourCompletedAt: true,
      termsAcceptedAt: true, termsVersion: true, guardianConsent: true, deletionRequestedAt: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });

  const [bookings, conversations, feedback, reportsFiled, sharedNotes, groups, signIns, activity] = await Promise.all([
    prisma.booking.findMany({
      where: { OR: [{ studentId: userId }, { tutorId: userId }] },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true, startsAt: true, endsAt: true, status: true, studentNotes: true, recap: true, cancelReason: true, createdAt: true,
        service: { select: { name: true } }, student: person, tutor: person,
      },
    }),
    prisma.conversation.findMany({
      where: { OR: [{ studentId: userId }, { tutorId: userId }] },
      select: {
        id: true, createdAt: true, student: person, tutor: person,
        messages: { orderBy: { createdAt: 'asc' }, select: { createdAt: true, kind: true, body: true, senderId: true, sender: person } },
      },
    }),
    prisma.sessionFeedback.findMany({ where: { studentId: userId }, select: { bookingId: true, rating: true, comment: true, createdAt: true } }),
    prisma.tutorReport.findMany({ where: { reporterId: userId }, select: { createdAt: true, category: true, details: true, status: true, tutor: person } }),
    prisma.studentNote.findMany({ where: { studentId: userId, visibility: 'SHARED' }, select: { createdAt: true, body: true, author: person } }),
    prisma.groupMember.findMany({ where: { userId }, select: { group: { select: { name: true } } } }),
    prisma.refreshToken.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100, select: { createdAt: true, ip: true, userAgent: true, revokedAt: true } }),
    prisma.auditLog.findMany({ where: { actorId: userId }, orderBy: { createdAt: 'desc' }, take: 500, select: { createdAt: true, action: true, entityType: true, ip: true } }),
  ]);

  await audit(userId, 'legal.data_exported', 'user', userId, undefined, ip);

  const { roles, ...profile } = user;
  return {
    about: `A copy of the personal data ${settings().legal.operatorName || 'we'} hold${settings().legal.operatorName ? 's' : ''} about you, exported ${new Date().toISOString()}.`,
    profile: { ...profile, roles: roles.map((r) => r.role.name) },
    bookings: bookings.map(({ service, student, tutor, ...b }) => ({ ...b, service: service.name, student: name(student), tutor: name(tutor) })),
    conversations: conversations.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      student: name(c.student),
      tutor: name(c.tutor),
      messages: c.messages.map((m) => ({ at: m.createdAt, kind: m.kind, from: m.senderId === userId ? 'you' : name(m.sender), body: m.body })),
    })),
    feedbackGiven: feedback,
    reportsFiled: reportsFiled.map(({ tutor, ...r }) => ({ ...r, tutor: name(tutor) })),
    notesSharedWithYou: sharedNotes.map(({ author, ...n }) => ({ ...n, author: name(author) })),
    groups: groups.map((g) => g.group.name),
    signIns,
    recentActivity: activity,
  };
}

export async function requestDeletion(userId: string, reason: string | undefined, ip?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, firstName: true, lastName: true, deletionRequestedAt: true } });
  if (user.deletionRequestedAt) return { deletionRequestedAt: user.deletionRequestedAt };
  const at = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { deletionRequestedAt: at } });
    await enqueueEmail(user.email, 'deletion_request_received', { firstName: user.firstName }, { tx });
    await enqueueToPermissionHolders(
      P.USERS_DELETE,
      'admin_deletion_request',
      { userId, userName: `${user.firstName} ${user.lastName}`, userEmail: user.email, reason: reason ?? '' },
      tx,
    );
  });
  await audit(userId, 'legal.deletion_requested', 'user', userId, reason ? { reason } : undefined, ip);
  return { deletionRequestedAt: at };
}

export async function cancelDeletionRequest(userId: string, ip?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { deletionRequestedAt: true } });
  if (!user.deletionRequestedAt) throw BadRequest('There is no deletion request to cancel');
  await prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: null } });
  await audit(userId, 'legal.deletion_request_cancelled', 'user', userId, undefined, ip);
}
