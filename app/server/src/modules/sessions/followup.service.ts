/**
 * After-session follow-up and calendars.
 *
 *  - Recap: the tutor's summary of a completed session (what was covered, homework).
 *    The student is emailed the first time it is posted; later edits are silent.
 *  - Feedback: the student rates a completed session 1–5 with an optional comment,
 *    and can change it for 14 days.
 *  - Calendar: a single session as an .ics file, and a personal feed URL that calendar
 *    apps poll. The feed URL carries an HMAC of a per-user key, so it works without
 *    signing in and can be reset (new key) without touching anything else.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { BadRequest, Forbidden, NotFound } from '../../lib/errors.js';
import { formatForUser } from '../../lib/time.js';
import { buildCalendar, type IcsEvent } from '../../lib/ics.js';
import { enqueueEmail } from '../email/email.service.js';
import { getBookingForParticipant, guestLink } from '../scheduling/scheduling.service.js';

type Auth = Express.AuthContext;
const FEEDBACK_WINDOW_DAYS = 14;
const name = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

export const feedbackOpen = (b: { status: string; endsAt: Date }, now = new Date()) =>
  b.status === 'COMPLETED' && now.getTime() - b.endsAt.getTime() < FEEDBACK_WINDOW_DAYS * 864e5;

// ---- recap ------------------------------------------------------------------------

export async function saveRecap(auth: Auth, bookingId: string, recap: string) {
  const b = await getBookingForParticipant(auth, bookingId);
  if (b.tutorId !== auth.userId) throw Forbidden('Only the session tutor can write the recap');
  if (b.status !== 'COMPLETED') throw BadRequest('You can write a recap once the session has ended');
  const first = !b.recapPostedAt;
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: b.id }, data: { recap, recapPostedAt: b.recapPostedAt ?? new Date() } });
    if (first) {
      await enqueueEmail(b.student.email, 'session_recap', {
        tutorName: name(b.tutor),
        serviceName: b.service.name,
        when: formatForUser(b.startsAt, b.student.timezone),
        recap,
        ...guestLink(b),
      }, { tx });
    }
  });
  return { emailed: first };
}

// ---- feedback -----------------------------------------------------------------------

export async function saveFeedback(auth: Auth, bookingId: string, input: { rating: number; comment?: string }) {
  const b = await getBookingForParticipant(auth, bookingId);
  if (b.studentId !== auth.userId) throw Forbidden('Only the student can rate this session');
  if (!feedbackOpen(b)) throw BadRequest(`You can rate a session for ${FEEDBACK_WINDOW_DAYS} days after it ends`);
  const data = { rating: input.rating, comment: input.comment || null };
  return prisma.sessionFeedback.upsert({
    where: { bookingId },
    create: { bookingId, studentId: auth.userId, ...data },
    update: data,
    select: { rating: true, comment: true, updatedAt: true },
  });
}

// ---- calendars ------------------------------------------------------------------------

type CalBooking = {
  id: string; startsAt: Date; endsAt: Date; status: string; meetingUrl: string | null; updatedAt: Date;
  service: { name: string }; student: { id: string; firstName: string; lastName: string }; tutor: { id: string; firstName: string; lastName: string };
};

function eventFor(b: CalBooking, viewerId: string): IcsEvent {
  const other = b.tutor.id === viewerId ? b.student : b.tutor;
  const status = b.status === 'PENDING' ? 'TENTATIVE' : ['CANCELLED', 'DECLINED'].includes(b.status) ? 'CANCELLED' : 'CONFIRMED';
  const lines = [
    `${b.service.name} with ${name(other)}.`,
    b.status === 'PENDING' ? 'Waiting for the tutor to confirm.' : '',
    b.meetingUrl ? `Join on Google Meet: ${b.meetingUrl}` : 'The Google Meet link will appear on your Sessions page.',
    `Manage: ${env.APP_URL}/sessions`,
  ].filter(Boolean);
  return {
    uid: `${b.id}@mindaccel`,
    start: b.startsAt,
    end: b.endsAt,
    summary: `${b.status === 'PENDING' ? '(Requested) ' : ''}${b.service.name} with ${name(other)}`,
    description: lines.join('\n'),
    location: b.meetingUrl ?? 'Google Meet',
    url: b.meetingUrl ?? `${env.APP_URL}/sessions`,
    status,
    sequence: Math.floor((b.updatedAt.getTime() - Date.UTC(2024, 0, 1)) / 1000),
    updated: b.updatedAt,
  };
}

const calSelect = {
  id: true, startsAt: true, endsAt: true, status: true, meetingUrl: true, updatedAt: true,
  service: { select: { name: true } },
  student: { select: { id: true, firstName: true, lastName: true } },
  tutor: { select: { id: true, firstName: true, lastName: true } },
} as const;

export async function sessionIcs(auth: Auth, bookingId: string): Promise<string> {
  await getBookingForParticipant(auth, bookingId); // access check
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: calSelect });
  return buildCalendar(b.service.name, [eventFor(b, auth.userId)]);
}

const feedToken = (userId: string, key: string) =>
  createHmac('sha256', env.JWT_ACCESS_SECRET).update(`calendar:${userId}:${key}`).digest('base64url').slice(0, 32);

export async function calendarFeedUrl(auth: Auth, reset = false): Promise<{ url: string }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { calendarKey: true } });
  let key = user.calendarKey;
  if (!key || reset) {
    key = randomBytes(18).toString('base64url');
    await prisma.user.update({ where: { id: auth.userId }, data: { calendarKey: key } });
  }
  return { url: `${env.APP_URL}/api/public/calendar/${auth.userId}/${feedToken(auth.userId, key)}.ics` };
}

/** The feed itself (no sign-in: the token is the credential). Wrong token = not found. */
export async function calendarFeed(userId: string, token: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { calendarKey: true, status: true, deletedAt: true, firstName: true } });
  if (!user?.calendarKey || user.status !== 'ACTIVE' || user.deletedAt) throw NotFound('Calendar');
  const expected = Buffer.from(feedToken(userId, user.calendarKey));
  const given = Buffer.from(token);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw NotFound('Calendar');

  const since = new Date(Date.now() - 60 * 864e5);
  const rows = await prisma.booking.findMany({
    where: {
      OR: [{ studentId: userId }, { tutorId: userId }],
      startsAt: { gte: since },
      status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'DECLINED'] },
    },
    select: calSelect,
    orderBy: { startsAt: 'asc' },
    take: 500,
  });
  return buildCalendar('Tutoring sessions', rows.map((b) => eventFor(b, userId)));
}
