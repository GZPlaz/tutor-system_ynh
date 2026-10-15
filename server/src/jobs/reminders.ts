/**
 * Session reminders. Each reminder has its own "sent_at" column so a restart
 * or overlapping run can never send the same reminder twice (the UPDATE ...
 * WHERE sent_at IS NULL acts as a claim).
 *
 *   T-24h  → student + tutor: "your session is tomorrow"
 *   T-1h   → student + tutor: "your session starts in an hour"
 *   T-15m  → tutor only, and only if no Meet link was posted yet
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { addMinutes, formatForUser } from '../lib/time.js';
import { enqueueEmail } from '../modules/email/email.service.js';

type Column = 'reminder24hSentAt' | 'reminder1hSentAt' | 'linkNudgeSentAt';

const people = {
  service: { select: { name: true } },
  student: { select: { email: true, firstName: true, lastName: true, timezone: true } },
  tutor: { select: { email: true, firstName: true, lastName: true, timezone: true } },
} as const;

async function dueBookings(column: Column, withinMinutes: number, extra: Prisma.BookingWhereInput = {}) {
  const now = new Date();
  const where = {
    status: 'CONFIRMED',
    startsAt: { gt: now, lte: addMinutes(now, withinMinutes) },
    [column]: null,
    ...extra,
  } as Prisma.BookingWhereInput;
  return prisma.booking.findMany({
    where,
    include: people,
    take: 200,
  });
}

/** Atomically mark as sent; returns false if another run already did. */
async function claim(id: string, column: Column): Promise<boolean> {
  const { count } = await prisma.booking.updateMany({
    where: { id, [column]: null } as Prisma.BookingWhereInput,
    data: { [column]: new Date() } as Prisma.BookingUpdateManyMutationInput,
  });
  return count === 1;
}

export async function sendReminders(): Promise<void> {
  // skipUnderMin: if the session is closer than this, the reminder would be
  // redundant (e.g. booked 2h ahead → no "within 24h" email, the 1h one follows).
  const plans: { column: Column; minutes: number; skipUnderMin: number; label: string }[] = [
    { column: 'reminder24hSentAt', minutes: 24 * 60, skipUnderMin: 180, label: 'within 24 hours' },
    { column: 'reminder1hSentAt', minutes: 60, skipUnderMin: 0, label: 'in about an hour' },
  ];

  for (const plan of plans) {
    for (const b of await dueBookings(plan.column, plan.minutes)) {
      if (!(await claim(b.id, plan.column))) continue;
      const minutesLeft = (b.startsAt.getTime() - Date.now()) / 60_000;
      if (minutesLeft < plan.skipUnderMin) continue; // claimed, deliberately not sent
      const base = { serviceName: b.service.name, leadLabel: plan.label };
      await enqueueEmail(b.student.email, 'session_reminder', {
        ...base,
        otherPartyName: `${b.tutor.firstName} ${b.tutor.lastName}`,
        when: formatForUser(b.startsAt, b.student.timezone),
      });
      await enqueueEmail(b.tutor.email, 'session_reminder', {
        ...base,
        otherPartyName: `${b.student.firstName} ${b.student.lastName}`,
        when: formatForUser(b.startsAt, b.tutor.timezone),
      });
    }
  }

  // Nudge tutors who haven't posted a Meet link yet.
  for (const b of await dueBookings('linkNudgeSentAt', env.MEETING_LINK_NUDGE_MIN, { meetingUrl: null })) {
    if (!(await claim(b.id, 'linkNudgeSentAt'))) continue;
    await enqueueEmail(b.tutor.email, 'tutor_link_nudge', {
      serviceName: b.service.name,
      studentName: `${b.student.firstName} ${b.student.lastName}`,
      when: formatForUser(b.startsAt, b.tutor.timezone),
    });
  }
}

/** Housekeeping: expired tokens and old sent emails. */
export async function cleanup(): Promise<void> {
  const now = new Date();
  const monthAgo = addMinutes(now, -30 * 1440);
  const [rt, prt, mail] = await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: monthAgo } }] } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: monthAgo } } }),
    prisma.emailOutbox.deleteMany({ where: { status: 'SENT', sentAt: { lt: monthAgo } } }),
  ]);
  logger.info({ refreshTokens: rt.count, resetTokens: prt.count, emails: mail.count }, 'Cleanup done');
}
