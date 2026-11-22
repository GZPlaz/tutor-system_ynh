/**
 * SESSIONS — the list behind the "Sessions" page, plus Meet links and notes.
 *
 *  - view=upcoming: requests waiting for the tutor, confirmed sessions and
 *    sessions in progress (soonest first)
 *  - view=past: finished, cancelled, declined, no-shows (newest first)
 *  - scope=all (staff with bookings:read_any): everyone's sessions
 *
 * Each item carries `actions` from bookingRules.ts, so the UI shows exactly
 * the buttons the server will accept (confirm, start, end, post link…).
 *
 * Meet links: the tutor can post (or replace) the link any time after
 * confirming. The student is emailed each time.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { Conflict, Forbidden } from '../../lib/errors.js';
import { addMinutes, formatForUser } from '../../lib/time.js';
import { audit } from '../audit/audit.service.js';
import { enqueueEmail } from '../email/email.service.js';
import { P } from '../rbac/permissions.js';
import { actionsFor, bookingInclude, getBookingForParticipant, guestLink } from '../scheduling/scheduling.service.js';
import { feedbackOpen } from './followup.service.js';

type Auth = Express.AuthContext;

/** meet.google.com/abc-defg-hij (optionally with query string, e.g. ?authuser=1). */
export const GOOGLE_MEET_URL = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?[\w=&%-]*)?$/;

const person = (u: { id: string; firstName: string; lastName: string }) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` });

export async function listSessions(auth: Auth, q: { view: 'upcoming' | 'past'; scope: 'mine' | 'all'; limit: number }) {
  const now = new Date();
  const all = q.scope === 'all' && (auth.can(P.BOOKINGS_READ_ANY) || auth.can(P.BOOKINGS_MANAGE_ANY));
  const mine: Prisma.BookingWhereInput = all ? {} : { OR: [{ studentId: auth.userId }, { tutorId: auth.userId }] };

  // "Upcoming" also keeps a session visible while it runs (or overruns by up to 3 hours).
  const upcoming: Prisma.BookingWhereInput = {
    status: { in: ['PENDING', 'CONFIRMED'] },
    endedAt: null,
    endsAt: { gte: addMinutes(now, -180) },
  };
  const where: Prisma.BookingWhereInput = { AND: [mine, q.view === 'upcoming' ? upcoming : { NOT: upcoming }] };

  const rows = await prisma.booking.findMany({
    where,
    include: {
      ...bookingInclude,
      feedPosts: { orderBy: { createdAt: 'desc' }, take: 8, include: { author: { select: { firstName: true, lastName: true } } } },
      feedback: { select: { rating: true, comment: true, updatedAt: true } },
    },
    orderBy: { startsAt: q.view === 'upcoming' ? 'asc' : 'desc' },
    take: q.limit,
  });

  return rows.map((b) => {
    const myRole = b.tutorId === auth.userId ? 'tutor' : b.studentId === auth.userId ? 'student' : 'staff';
    return {
      id: b.id,
      service: b.service.name,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      status: b.status,
      confirmedAt: b.confirmedAt,
      startedAt: b.startedAt,
      endedAt: b.endedAt,
      isLive: !!b.startedAt && !b.endedAt,
      myRole,
      student: person(b.student),
      tutor: person(b.tutor),
      notes: b.studentNotes,
      reason: b.cancelReason,
      meetingUrl: b.meetingUrl,
      recap: b.recap,
      recapPostedAt: b.recapPostedAt,
      // Students see their own rating; tutors and staff see what the student said.
      feedback: b.feedback,
      canRecap: myRole === 'tutor' && b.status === 'COMPLETED',
      canRate: myRole === 'student' && feedbackOpen(b, now),
      actions: actionsFor(auth, b, now),
      posts: b.feedPosts.map((p) => ({
        id: p.id,
        kind: p.kind,
        message: p.message,
        author: p.author ? `${p.author.firstName} ${p.author.lastName}` : 'MindAccel',
        createdAt: p.createdAt,
      })),
    };
  });
}

/** Counts for badges in the navigation (e.g. requests waiting for this tutor). */
export async function sessionCounts(auth: Auth) {
  const [requests, today] = await Promise.all([
    prisma.booking.count({ where: { tutorId: auth.userId, status: 'PENDING', startsAt: { gt: new Date() } } }),
    prisma.booking.count({
      where: {
        OR: [{ studentId: auth.userId }, { tutorId: auth.userId }],
        status: 'CONFIRMED',
        endedAt: null,
        startsAt: { lt: addMinutes(new Date(), 24 * 60) },
        endsAt: { gt: new Date() },
      },
    }),
  ]);
  return { requests, next24h: today };
}

export async function postMeetingLink(auth: Auth, bookingId: string, meetingUrl: string, message?: string) {
  const b = await getBookingForParticipant(auth, bookingId);
  if (!actionsFor(auth, b).postLink) {
    throw b.tutorId === auth.userId || auth.can(P.BOOKINGS_MANAGE_ANY)
      ? Conflict(b.status === 'PENDING' ? 'Confirm the request before adding a Meet link' : 'This session is closed', 'ACTION_NOT_ALLOWED')
      : Forbidden('Only the session tutor can add the Meet link');
  }

  const tutorName = `${b.tutor.firstName} ${b.tutor.lastName}`;
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: b.id }, data: { meetingUrl, meetingPostedAt: new Date() } });
    await tx.sessionFeedPost.create({
      data: { bookingId: b.id, authorId: auth.userId, kind: 'MEETING_LINK', meetingUrl, message: message ?? (b.meetingUrl ? 'Updated the Meet link' : 'Added the Meet link') },
    });
    await enqueueEmail(b.student.email, 'meeting_link_posted', {
      tutorName,
      serviceName: b.service.name,
      when: formatForUser(b.startsAt, b.student.timezone),
      meetingUrl,
      ...guestLink(b),
    }, { tx });
  });
  await audit(auth.userId, 'session.link_posted', 'booking', b.id);
}

export async function postNote(auth: Auth, bookingId: string, message: string) {
  const b = await getBookingForParticipant(auth, bookingId);
  if (b.tutorId !== auth.userId && b.studentId !== auth.userId && !auth.can(P.BOOKINGS_MANAGE_ANY)) throw Forbidden();
  return prisma.sessionFeedPost.create({ data: { bookingId: b.id, authorId: auth.userId, kind: 'NOTE', message } });
}
