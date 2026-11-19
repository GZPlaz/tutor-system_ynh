/**
 * Scheduling: services catalog, tutor availability, slot lookup, bookings.
 *
 * Double-booking is prevented twice:
 *   1. Application check — the requested start must be one of the computed slots.
 *   2. Database guarantee — exclusion constraints on `bookings` (see the SQL
 *      migration) reject any overlapping insert, even under a race.
 */
import type { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError, BadRequest, Conflict, Forbidden, NotFound } from '../../lib/errors.js';
import { addMinutes, formatForUser } from '../../lib/time.js';
import { audit } from '../audit/audit.service.js';
import { enqueueEmail } from '../email/email.service.js';
import { P } from '../rbac/permissions.js';
import { computeSlots, type Slot } from './slots.js';
import { bookingActions, type BookingActions } from './bookingRules.js';
import { guestManageUrl } from '../../lib/guestToken.js';
import { maintenanceMessage, settings } from '../settings/general.js';

type Auth = Express.AuthContext;
const ACTIVE: BookingStatus[] = ['PENDING', 'CONFIRMED'];
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

// -----------------------------------------------------------------------------
// Services
// -----------------------------------------------------------------------------

export function listServices(includeInactive: boolean) {
  return prisma.service.findMany({
    where: includeInactive ? { deletedAt: null } : { isActive: true, deletedAt: null },
    include: { tutors: { select: { tutor: { select: { id: true, firstName: true, lastName: true } } } } },
    orderBy: { name: 'asc' },
  });
}

export function createService(data: Prisma.ServiceCreateInput) {
  return prisma.service.create({ data });
}

export async function updateService(id: string, data: Prisma.ServiceUpdateInput) {
  const s = await prisma.service.findFirst({ where: { id, deletedAt: null } });
  if (!s) throw NotFound('Service');
  return prisma.service.update({ where: { id }, data });
}

/**
 * Delete a service. Upcoming sessions block deletion unless `cancelUpcoming`
 * is set, in which case they are cancelled and both people are emailed.
 * A service with past sessions is soft-deleted (hidden everywhere, history
 * keeps its name); one that was never booked is removed completely.
 */
export async function deleteService(auth: Auth, id: string, cancelUpcoming: boolean) {
  const service = await prisma.service.findFirst({ where: { id, deletedAt: null } });
  if (!service) throw NotFound('Service');

  const upcoming = await prisma.booking.findMany({
    where: { serviceId: id, status: { in: ACTIVE }, endedAt: null, endsAt: { gt: new Date() } },
    include: bookingInclude,
  });
  if (upcoming.length && !cancelUpcoming) {
    throw Conflict(
      `${upcoming.length} upcoming session${upcoming.length === 1 ? '' : 's'} use this service`,
      'SERVICE_HAS_BOOKINGS',
      { upcoming: upcoming.length },
    );
  }
  await cancelMany(auth.userId, upcoming, 'This service is no longer offered');

  const history = await prisma.booking.count({ where: { serviceId: id } });
  if (history) {
    await prisma.$transaction([
      prisma.tutorService.deleteMany({ where: { serviceId: id } }),
      prisma.service.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }),
    ]);
  } else {
    await prisma.service.delete({ where: { id } });
  }
  await audit(auth.userId, 'service.deleted', 'service', id, { name: service.name, cancelled: upcoming.length, kept: !!history });
  return { cancelled: upcoming.length, mode: history ? 'archived' : 'deleted' };
}

export async function setServiceTutors(serviceId: string, tutorIds: string[]) {
  await prisma.$transaction([
    prisma.tutorService.deleteMany({ where: { serviceId } }),
    prisma.tutorService.createMany({ data: tutorIds.map((tutorId) => ({ tutorId, serviceId })) }),
  ]);
}

// -----------------------------------------------------------------------------
// Availability
// -----------------------------------------------------------------------------

/** Tutors manage their own; staff with availability:manage_any can manage anyone's. */
function assertCanManageAvailability(auth: Auth, tutorId: string) {
  if (auth.can(P.AVAILABILITY_MANAGE_ANY)) return;
  if (auth.can(P.AVAILABILITY_MANAGE_OWN) && auth.userId === tutorId) return;
  throw Forbidden("You cannot manage this tutor's availability");
}

export async function getAvailability(auth: Auth, tutorId: string) {
  assertCanManageAvailability(auth, tutorId);
  const [rules, exceptions] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { tutorId }, orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] }),
    prisma.availabilityException.findMany({
      where: { tutorId, endsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
    }),
  ]);
  return { rules, exceptions };
}

/** Replace the tutor's whole weekly template in one call (matches a weekly-grid UI). */
export async function replaceWeeklyRules(
  auth: Auth,
  tutorId: string,
  rules: { weekday: number; startMinute: number; endMinute: number; timezone: string; effectiveFrom?: Date; effectiveTo?: Date }[],
) {
  assertCanManageAvailability(auth, tutorId);
  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({ where: { tutorId } }),
    prisma.availabilityRule.createMany({ data: rules.map((r) => ({ ...r, tutorId })) }),
  ]);
  await audit(auth.userId, 'availability.rules_replaced', 'user', tutorId, { count: rules.length });
  return getAvailability(auth, tutorId);
}

export async function addException(
  auth: Auth,
  tutorId: string,
  input: { startsAt: Date; endsAt: Date; isAvailable: boolean; reason?: string },
) {
  assertCanManageAvailability(auth, tutorId);
  return prisma.availabilityException.create({ data: { ...input, tutorId } });
}

export async function deleteException(auth: Auth, id: string) {
  const ex = await prisma.availabilityException.findUnique({ where: { id } });
  if (!ex) throw NotFound('Exception');
  assertCanManageAvailability(auth, ex.tutorId);
  await prisma.availabilityException.delete({ where: { id } });
}

// -----------------------------------------------------------------------------
// Slots
// -----------------------------------------------------------------------------

async function tutorSlots(
  tutorId: string,
  service: { durationMinutes: number; bufferMinutes: number },
  from: Date,
  to: Date,
  studentId?: string,
): Promise<Slot[]> {
  // Pad the busy lookup so bookings that straddle the range edges are seen.
  const padFrom = addMinutes(from, -24 * 60);
  const padTo = addMinutes(to, 24 * 60);

  const [rules, exceptions, tutorBusy, studentBusy] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { tutorId } }),
    prisma.availabilityException.findMany({ where: { tutorId, endsAt: { gt: padFrom }, startsAt: { lt: padTo } } }),
    prisma.booking.findMany({
      where: { tutorId, status: { in: ACTIVE }, blockedUntil: { gt: padFrom }, startsAt: { lt: padTo } },
      select: { startsAt: true, blockedUntil: true },
    }),
    studentId
      ? prisma.booking.findMany({
          where: { studentId, status: { in: ACTIVE }, endsAt: { gt: padFrom }, startsAt: { lt: padTo } },
          select: { startsAt: true, endsAt: true },
        })
      : Promise.resolve([]),
  ]);

  return computeSlots({
    rules,
    exceptions,
    busy: [
      ...tutorBusy.map((b) => ({ startsAt: b.startsAt, endsAt: b.blockedUntil })),
      // The student can't be in two sessions at once either (buffer not applied to students).
      ...studentBusy.map((b) => ({ startsAt: addMinutes(b.startsAt, -service.bufferMinutes), endsAt: b.endsAt })),
    ],
    durationMinutes: service.durationMinutes,
    bufferMinutes: service.bufferMinutes,
    from,
    to,
    now: new Date(),
    minLeadHours: settings().booking.minLeadHours,
    maxHorizonDays: settings().booking.maxHorizonDays,
    stepMinutes: settings().booking.slotStepMinutes,
  });
}

export function findSlots(auth: Auth, q: { serviceId: string; from: Date; to: Date; tutorId?: string }) {
  return findSlotsFor(auth.userId, q);
}

/** `studentId` null = a visitor without an account (nothing of theirs to subtract). */
export async function findSlotsFor(studentId: string | null, q: { serviceId: string; from: Date; to: Date; tutorId?: string }) {
  if (q.to.getTime() - q.from.getTime() > 31 * 86_400_000) throw BadRequest('Range may not exceed 31 days');
  const service = await prisma.service.findFirst({
    where: { id: q.serviceId, isActive: true, deletedAt: null },
    include: { tutors: { include: { tutor: { select: { id: true, firstName: true, lastName: true, status: true } } } } },
  });
  if (!service) throw NotFound('Service');

  const tutors = service.tutors
    .map((t) => t.tutor)
    .filter((t) => t.status === 'ACTIVE' && (!q.tutorId || t.id === q.tutorId));

  return Promise.all(
    tutors.map(async (t) => ({
      tutor: { id: t.id, name: fullName(t) },
      slots: await tutorSlots(t.id, service, q.from, q.to, studentId ?? undefined),
    })),
  );
}

// -----------------------------------------------------------------------------
// Bookings
// -----------------------------------------------------------------------------

export const bookingInclude = {
  service: { select: { id: true, name: true, durationMinutes: true } },
  student: { select: { id: true, firstName: true, lastName: true, email: true, timezone: true, isGuest: true } },
  tutor: { select: { id: true, firstName: true, lastName: true, email: true, timezone: true } },
} satisfies Prisma.BookingInclude;

export type BookingWithPeople = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export function actionsFor(auth: Auth, b: BookingWithPeople, now = new Date()): BookingActions {
  return bookingActions(b, auth, now, settings().booking.studentCancelCutoffHours);
}

/** Load a booking the caller may see and assert they may perform `action`. */
async function loadFor(auth: Auth, id: string, action: keyof BookingActions, message: string) {
  const b = await getBookingForParticipant(auth, id);
  if (!actionsFor(auth, b)[action]) throw Conflict(message, 'ACTION_NOT_ALLOWED');
  return b;
}

const whenFor = (b: BookingWithPeople, who: 'student' | 'tutor') => formatForUser(b.startsAt, b[who].timezone);

/** Guests have no Sessions page, so their emails carry a private link to their booking. */
export const guestLink = (b: { id: string; student: { isGuest: boolean } }): { manageUrl?: string } =>
  b.student.isGuest ? { manageUrl: guestManageUrl(b.id) } : {};

export async function createBooking(
  auth: Auth,
  input: { serviceId: string; tutorId: string; startsAt: Date; notes?: string; studentId?: string },
) {
  // Staff may book on behalf of a student; everyone else books for themselves.
  const studentId = input.studentId && auth.can(P.BOOKINGS_MANAGE_ANY) ? input.studentId : auth.userId;
  if (studentId === input.tutorId) throw BadRequest('You cannot book a session with yourself');

  const service = await prisma.service.findFirst({ where: { id: input.serviceId, isActive: true, deletedAt: null } });
  if (!service) throw NotFound('Service');
  const offers = await prisma.tutorService.findUnique({
    where: { tutorId_serviceId: { tutorId: input.tutorId, serviceId: service.id } },
  });
  if (!offers) throw BadRequest('This tutor does not offer that service');

  const endsAt = addMinutes(input.startsAt, service.durationMinutes);
  const available = await tutorSlots(input.tutorId, service, input.startsAt, endsAt, studentId);
  if (!available.some((s) => s.startsAt === input.startsAt.toISOString())) {
    throw Conflict('That time is not available. Please pick another slot.', 'SLOT_UNAVAILABLE');
  }

  // Requests wait for the tutor's OK. Staff (or the tutor) booking directly skip that step.
  const autoConfirm = auth.can(P.BOOKINGS_MANAGE_ANY) || auth.userId === input.tutorId;

  const booking = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.create({
      data: {
        studentId,
        tutorId: input.tutorId,
        serviceId: service.id,
        startsAt: input.startsAt,
        endsAt,
        blockedUntil: addMinutes(endsAt, service.bufferMinutes),
        status: autoConfirm ? 'CONFIRMED' : 'PENDING',
        confirmedAt: autoConfirm ? new Date() : null,
        studentNotes: input.notes,
      },
      include: bookingInclude,
    });
    await tx.sessionFeedPost.create({
      data: { bookingId: b.id, authorId: auth.userId, kind: 'SYSTEM', message: autoConfirm ? 'Session booked' : 'Session requested' },
    });
    await sendNewBookingEmails(tx, b, autoConfirm);
    return b;
  });

  await audit(auth.userId, 'booking.created', 'booking', booking.id, { status: booking.status });
  return { booking };
}

/** Emails for a new request/booking. Each person gets times in THEIR OWN timezone. */
async function sendNewBookingEmails(tx: Prisma.TransactionClient, b: BookingWithPeople, confirmed: boolean) {
  const base = { serviceName: b.service.name, notes: b.studentNotes };
  if (confirmed) {
    await enqueueEmail(b.student.email, 'booking_confirmed', { ...base, otherPartyName: fullName(b.tutor), when: whenFor(b, 'student'), ...guestLink(b) }, { tx });
    await enqueueEmail(b.tutor.email, 'booking_confirmed', { ...base, otherPartyName: fullName(b.student), when: whenFor(b, 'tutor') }, { tx });
  } else {
    await enqueueEmail(b.student.email, 'booking_requested', { ...base, otherPartyName: fullName(b.tutor), when: whenFor(b, 'student'), ...guestLink(b) }, { tx });
    await enqueueEmail(b.tutor.email, 'booking_request', { ...base, studentName: fullName(b.student), when: whenFor(b, 'tutor') }, { tx });
  }
}

// -----------------------------------------------------------------------------
// Booking without an account (Settings → "Account needed to book" switched off)
// -----------------------------------------------------------------------------

/** Services a visitor without an account may book (every active service with a tutor). */
export async function listGuestServices() {
  return (await listServices(false)).filter((svc) => svc.tutors.length > 0);
}

export function assertGuestBookingOpen() {
  const s = settings();
  if (s.maintenance.enabled) throw new AppError(503, 'MAINTENANCE', maintenanceMessage());
  if (s.booking.requireAccount) throw Forbidden('Please sign in or create an account to book a session.', 'ACCOUNT_REQUIRED');
}

/**
 * A visitor requests a session with just a name and email. Behind the scenes they
 * become a "guest" user (no password, can never sign in) so every rule that protects
 * bookings — no double-booking, tutor confirmation, reminders — works unchanged.
 */
export async function createGuestBooking(input: {
  serviceId: string;
  tutorId: string;
  startsAt: Date;
  notes?: string;
  firstName: string;
  lastName: string;
  email: string;
  timezone: string;
}) {
  assertGuestBookingOpen();

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing && !existing.isGuest) {
    throw Conflict('There is already an account with this email address. Please sign in to book.', 'ACCOUNT_EXISTS');
  }
  const service = await prisma.service.findFirst({ where: { id: input.serviceId, isActive: true, deletedAt: null } });
  if (!service) throw NotFound('Service');
  const offers = await prisma.tutorService.findUnique({
    where: { tutorId_serviceId: { tutorId: input.tutorId, serviceId: service.id } },
  });
  if (!offers) throw BadRequest('This tutor does not offer that service');

  const endsAt = addMinutes(input.startsAt, service.durationMinutes);
  const available = await tutorSlots(input.tutorId, service, input.startsAt, endsAt, existing?.id);
  if (!available.some((slot) => slot.startsAt === input.startsAt.toISOString())) {
    throw Conflict('That time is not available. Please pick another slot.', 'SLOT_UNAVAILABLE');
  }

  let booking: BookingWithPeople;
  try {
    booking = await prisma.$transaction(async (tx) => {
      const person = { firstName: input.firstName, lastName: input.lastName, timezone: input.timezone };
      const guest = existing
        ? await tx.user.update({ where: { id: existing.id }, data: person })
        : await tx.user.create({ data: { email: input.email, ...person, status: 'ACTIVE', isGuest: true } });

      const created = await tx.booking.create({
        data: {
          studentId: guest.id,
          tutorId: input.tutorId,
          serviceId: service.id,
          startsAt: input.startsAt,
          endsAt,
          blockedUntil: addMinutes(endsAt, service.bufferMinutes),
          status: 'PENDING',
          studentNotes: input.notes,
        },
        include: bookingInclude,
      });
      await tx.sessionFeedPost.create({ data: { bookingId: created.id, authorId: guest.id, kind: 'SYSTEM', message: 'Session requested' } });
      await sendNewBookingEmails(tx, created, false);
      return created;
    });
  } catch (err) {
    // Two requests for a brand-new email at the same instant: the second one loses the race.
    if (typeof err === 'object' && err && (err as { code?: string }).code === 'P2002') {
      throw Conflict('Something went wrong while saving your request. Please try again.', 'TRY_AGAIN');
    }
    throw err;
  }

  await audit(booking.studentId, 'booking.created_as_guest', 'booking', booking.id, { status: booking.status });
  return booking;
}

/** The synthetic "caller" for a guest who proved they own a booking with its signed link. */
function guestAuth(student: { id: string; email: string; timezone: string }): Auth {
  const may = new Set<string>([P.BOOKINGS_CANCEL_OWN]);
  return { userId: student.id, email: student.email, timezone: student.timezone, roles: [], permissions: may, can: (p) => may.has(p) };
}

async function loadGuestBooking(id: string): Promise<BookingWithPeople> {
  const b = await prisma.booking.findUnique({ where: { id }, include: bookingInclude });
  if (!b || !b.student.isGuest) throw NotFound('Booking');
  return b;
}

/** What a guest sees on their booking page (no tutor email, no internal ids). */
export async function getGuestBookingView(id: string) {
  const b = await loadGuestBooking(id);
  const actions = actionsFor(guestAuth(b.student), b);
  return {
    id: b.id,
    status: b.status,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    timezone: b.student.timezone,
    firstName: b.student.firstName,
    service: { name: b.service.name, durationMinutes: b.service.durationMinutes },
    tutorName: fullName(b.tutor),
    notes: b.studentNotes,
    cancelReason: b.cancelReason,
    // The Meet link is only useful (and only shown) once the tutor has confirmed.
    meetingUrl: b.status === 'CONFIRMED' && !b.endedAt ? b.meetingUrl : null,
    canCancel: actions.cancel,
    cancelTooLate: actions.cancelTooLate,
    cancelCutoffHours: settings().booking.studentCancelCutoffHours,
  };
}

export async function cancelGuestBooking(id: string, reason?: string) {
  const b = await loadGuestBooking(id);
  await cancelBooking(guestAuth(b.student), id, reason);
}

export async function getBookingForParticipant(auth: Auth, id: string): Promise<BookingWithPeople> {
  const b = await prisma.booking.findUnique({ where: { id }, include: bookingInclude });
  if (!b) throw NotFound('Booking');
  const participant = b.studentId === auth.userId || b.tutorId === auth.userId;
  if (!participant && !auth.can(P.BOOKINGS_READ_ANY) && !auth.can(P.BOOKINGS_MANAGE_ANY)) throw NotFound('Booking');
  return b;
}

export async function listBookings(
  auth: Auth,
  q: { from?: Date; to?: Date; status?: BookingStatus; scope: 'mine' | 'all'; order: 'asc' | 'desc'; page: number; pageSize: number },
) {
  const all = q.scope === 'all' && auth.can(P.BOOKINGS_READ_ANY);
  const where: Prisma.BookingWhereInput = {
    status: q.status,
    startsAt: { gte: q.from, lt: q.to },
    ...(all ? {} : { OR: [{ studentId: auth.userId }, { tutorId: auth.userId }] }),
  };
  const [total, items] = await prisma.$transaction([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { startsAt: q.order },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return { total, items: items.map((b) => ({ ...b, actions: actionsFor(auth, b) })) };
}

/** Tutor accepts a request. */
export async function confirmBooking(auth: Auth, id: string) {
  const b = await loadFor(auth, id, 'confirm', 'This request can no longer be confirmed');
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
    await tx.sessionFeedPost.create({ data: { bookingId: id, authorId: auth.userId, kind: 'SYSTEM', message: 'Confirmed by the tutor' } });
    await enqueueEmail(b.student.email, 'booking_confirmed', {
      serviceName: b.service.name, otherPartyName: fullName(b.tutor), when: whenFor(b, 'student'), ...guestLink(b),
    }, { tx });
  });
  await audit(auth.userId, 'booking.confirmed', 'booking', id);
}

/** Tutor turns a request down; the time becomes free again. */
export async function declineBooking(auth: Auth, id: string, reason?: string) {
  const b = await loadFor(auth, id, 'decline', 'This request can no longer be declined');
  await declineRequest(b, auth.userId, reason);
  await audit(auth.userId, 'booking.declined', 'booking', id, { reason });
}

async function declineRequest(b: BookingWithPeople, actorId: string | null, reason?: string) {
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: b.id },
      data: { status: 'DECLINED', cancelledAt: new Date(), cancelledById: actorId, cancelReason: reason },
    });
    await tx.sessionFeedPost.create({
      data: { bookingId: b.id, authorId: actorId, kind: 'SYSTEM', message: `Declined${reason ? `: ${reason}` : ''}` },
    });
    await enqueueEmail(b.student.email, 'booking_declined', {
      serviceName: b.service.name, otherPartyName: fullName(b.tutor), when: whenFor(b, 'student'), reason, ...guestLink(b),
    }, { tx });
  });
}

/** Requests nobody confirmed before their start time are declined automatically (background job). */
export async function expireUnconfirmedRequests(): Promise<number> {
  const stale = await prisma.booking.findMany({
    where: { status: 'PENDING', startsAt: { lte: new Date() } },
    include: bookingInclude,
    take: 100,
  });
  for (const b of stale) await declineRequest(b, null, 'The tutor did not confirm this request in time');
  return stale.length;
}

/** Tutor opens the session — on time or early. The student is told it's live. */
export async function startSession(auth: Auth, id: string) {
  const b = await loadFor(auth, id, 'start', 'This session cannot be started');
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id }, data: { startedAt: new Date() } });
    await tx.sessionFeedPost.create({ data: { bookingId: id, authorId: auth.userId, kind: 'SYSTEM', message: 'Session started' } });
    await enqueueEmail(b.student.email, 'session_started', {
      serviceName: b.service.name, tutorName: fullName(b.tutor), meetingUrl: b.meetingUrl, ...guestLink(b),
    }, { tx });
  });
  await audit(auth.userId, 'booking.started', 'booking', id);
}

/** Tutor closes the session — on time or early. Ending early frees the rest of the slot. */
export async function endSession(auth: Auth, id: string) {
  const b = await loadFor(auth, id, 'end', 'This session cannot be ended');
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id }, data: { status: 'COMPLETED', startedAt: b.startedAt ?? now, endedAt: now } });
    await tx.sessionFeedPost.create({ data: { bookingId: id, authorId: auth.userId, kind: 'SYSTEM', message: 'Session ended' } });
  });
  await audit(auth.userId, 'booking.ended', 'booking', id, { early: now < b.endsAt });
}

export async function cancelBooking(auth: Auth, id: string, reason?: string) {
  const b = await getBookingForParticipant(auth, id);
  const a = actionsFor(auth, b);
  if (a.cancelTooLate) {
    throw Conflict(`Sessions can only be cancelled up to ${settings().booking.studentCancelCutoffHours} hours in advance. Please contact your tutor.`, 'CANCEL_CUTOFF');
  }
  if (!a.cancel) throw Conflict('This session can no longer be cancelled', 'NOT_CANCELLABLE');
  await cancelMany(auth.userId, [b], reason);
  await audit(auth.userId, 'booking.cancelled', 'booking', id, { reason });
}

/** Cancel bookings and email both people (used by cancel, service and account deletion). */
export async function cancelMany(actorId: string, bookings: BookingWithPeople[], reason?: string) {
  if (!bookings.length) return;
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } });
  const cancelledByName = actor ? fullName(actor) : 'MindAccel';
  for (const b of bookings) {
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: b.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actorId, cancelReason: reason },
      });
      await tx.sessionFeedPost.create({
        data: { bookingId: b.id, authorId: actorId, kind: 'SYSTEM', message: `Cancelled${reason ? `: ${reason}` : ''}` },
      });
      const common = { serviceName: b.service.name, cancelledByName, reason };
      await enqueueEmail(b.student.email, 'booking_cancelled', { ...common, otherPartyName: fullName(b.tutor), when: whenFor(b, 'student'), ...guestLink(b) }, { tx });
      await enqueueEmail(b.tutor.email, 'booking_cancelled', { ...common, otherPartyName: fullName(b.student), when: whenFor(b, 'tutor') }, { tx });
    });
  }
}

/** Student didn't turn up (session never started, start time has passed). */
export async function markNoShow(auth: Auth, id: string) {
  await loadFor(auth, id, 'noShow', 'This session cannot be marked as a no-show');
  await prisma.booking.update({ where: { id }, data: { status: 'NO_SHOW' } });
  await audit(auth.userId, 'booking.no_show', 'booking', id);
}
