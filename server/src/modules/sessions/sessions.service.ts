/**
 * VIRTUAL SESSION FEED
 * --------------------
 * A per-user timeline of upcoming/recent sessions. Shortly before a session,
 * the tutor posts the Google Meet link; it appears on the student's feed and
 * the student is emailed. Rules:
 *   - only the booking's tutor (or staff) can post
 *   - posting opens MEETING_LINK_WINDOW_MIN before start and closes at end
 *   - links must be real Google Meet URLs (blocks phishing via the feed)
 *   - re-posting replaces the link (e.g. tutor regenerated the meeting)
 *
 * Clients poll GET /sessions/feed every ~30s; swapping to SSE/WebSockets later
 * only touches the route + client, not this service.
 */
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { Conflict, Forbidden } from '../../lib/errors.js';
import { addMinutes, formatForUser } from '../../lib/time.js';
import { audit } from '../audit/audit.service.js';
import { enqueueEmail } from '../email/email.service.js';
import { P } from '../rbac/permissions.js';
import { getBookingForParticipant } from '../scheduling/scheduling.service.js';

type Auth = Express.AuthContext;

/** meet.google.com/abc-defg-hij (optionally with query string, e.g. ?authuser=1). */
export const GOOGLE_MEET_URL = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?[\w=&%-]*)?$/;

export async function getFeed(auth: Auth, opts: { pastHours: number; aheadDays: number }) {
  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ studentId: auth.userId }, { tutorId: auth.userId }],
      status: { in: ['CONFIRMED', 'COMPLETED', 'CANCELLED'] },
      endsAt: { gte: addMinutes(now, -opts.pastHours * 60) },
      startsAt: { lte: addMinutes(now, opts.aheadDays * 1440) },
    },
    include: {
      service: { select: { name: true } },
      student: { select: { id: true, firstName: true, lastName: true } },
      tutor: { select: { id: true, firstName: true, lastName: true } },
      feedPosts: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { author: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { startsAt: 'asc' },
  });

  return bookings.map((b) => {
    const isTutor = b.tutorId === auth.userId;
    const opensAt = addMinutes(b.startsAt, -env.MEETING_LINK_WINDOW_MIN);
    return {
      id: b.id,
      service: b.service.name,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      status: b.status,
      myRole: isTutor ? 'tutor' : 'student',
      counterpart: isTutor ? b.student : b.tutor,
      meetingUrl: b.meetingUrl,
      meetingPostedAt: b.meetingPostedAt,
      // UI hints so the frontend doesn't duplicate business rules
      canPostLink: isTutor && b.status === 'CONFIRMED' && now >= opensAt && now <= b.endsAt,
      linkWindowOpensAt: opensAt,
      isLive: now >= b.startsAt && now <= b.endsAt,
      posts: b.feedPosts.map((p) => ({
        id: p.id,
        kind: p.kind,
        message: p.message,
        meetingUrl: p.meetingUrl,
        author: p.author ? `${p.author.firstName} ${p.author.lastName}` : 'System',
        createdAt: p.createdAt,
      })),
    };
  });
}

export async function postMeetingLink(auth: Auth, bookingId: string, meetingUrl: string, message?: string) {
  const b = await getBookingForParticipant(auth, bookingId);
  const isStaff = auth.can(P.BOOKINGS_MANAGE_ANY);
  if (b.tutorId !== auth.userId && !isStaff) throw Forbidden('Only the session tutor can post the join link');
  if (b.status !== 'CONFIRMED') throw Conflict('This session is not active');

  const now = new Date();
  const opensAt = addMinutes(b.startsAt, -env.MEETING_LINK_WINDOW_MIN);
  if (!isStaff && (now < opensAt || now > b.endsAt)) {
    throw Conflict(`The link can be posted from ${env.MEETING_LINK_WINDOW_MIN} minutes before the session until it ends`, 'LINK_WINDOW_CLOSED');
  }

  const tutorName = `${b.tutor.firstName} ${b.tutor.lastName}`;
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: b.id }, data: { meetingUrl, meetingPostedAt: now } });
    await tx.sessionFeedPost.create({
      data: { bookingId: b.id, authorId: auth.userId, kind: 'MEETING_LINK', meetingUrl, message },
    });
    await enqueueEmail(b.student.email, 'meeting_link_posted', {
      tutorName,
      serviceName: b.service.name,
      when: formatForUser(b.startsAt, b.student.timezone),
      meetingUrl,
    }, { tx });
  });
  await audit(auth.userId, 'session.link_posted', 'booking', b.id);
}

export async function postNote(auth: Auth, bookingId: string, message: string) {
  const b = await getBookingForParticipant(auth, bookingId);
  if (b.tutorId !== auth.userId && b.studentId !== auth.userId && !auth.can(P.BOOKINGS_MANAGE_ANY)) throw Forbidden();
  return prisma.sessionFeedPost.create({ data: { bookingId: b.id, authorId: auth.userId, kind: 'NOTE', message } });
}
