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
import { env } from '../../config/env.js';
import { BadRequest, Conflict, Forbidden, NotFound } from '../../lib/errors.js';
import { addMinutes, formatForUser } from '../../lib/time.js';
import { audit } from '../audit/audit.service.js';
import { enqueueEmail } from '../email/email.service.js';
import { P } from '../rbac/permissions.js';
import { computeSlots, type Slot } from './slots.js';

type Auth = Express.AuthContext;
const ACTIVE: BookingStatus[] = ['PENDING', 'CONFIRMED'];
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

// -----------------------------------------------------------------------------
// Services
// -----------------------------------------------------------------------------

export function listServices(includeInactive: boolean) {
  return prisma.service.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: { tutors: { select: { tutor: { select: { id: true, firstName: true, lastName: true } } } } },
    orderBy: { name: 'asc' },
  });
}

export function createService(data: Prisma.ServiceCreateInput) {
  return prisma.service.create({ data });
}

export function updateService(id: string, data: Prisma.ServiceUpdateInput) {
  return prisma.service.update({ where: { id }, data });
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
    minLeadHours: env.BOOKING_MIN_LEAD_HOURS,
    maxHorizonDays: env.BOOKING_MAX_HORIZON_DAYS,
    stepMinutes: env.BOOKING_SLOT_STEP_MIN,
  });
}

export async function findSlots(auth: Auth, q: { serviceId: string; from: Date; to: Date; tutorId?: string }) {
  if (q.to.getTime() - q.from.getTime() > 31 * 86_400_000) throw BadRequest('Range may not exceed 31 days');
  const service = await prisma.service.findFirst({
    where: { id: q.serviceId, isActive: true },
    include: { tutors: { include: { tutor: { select: { id: true, firstName: true, lastName: true, status: true } } } } },
  });
  if (!service) throw NotFound('Service');

  const tutors = service.tutors
    .map((t) => t.tutor)
    .filter((t) => t.status === 'ACTIVE' && (!q.tutorId || t.id === q.tutorId));

  return Promise.all(
    tutors.map(async (t) => ({
      tutor: { id: t.id, name: fullName(t) },
      slots: await tutorSlots(t.id, service, q.from, q.to, auth.userId),
    })),
  );
}

// -----------------------------------------------------------------------------
// Bookings
// -----------------------------------------------------------------------------

const bookingInclude = {
  service: { select: { id: true, name: true, durationMinutes: true } },
  student: { select: { id: true, firstName: true, lastName: true, email: true, timezone: true } },
  tutor: { select: { id: true, firstName: true, lastName: true, email: true, timezone: true } },
} satisfies Prisma.BookingInclude;

export type BookingWithPeople = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export async function createBooking(
  auth: Auth,
  input: { serviceId: string; tutorId: string; startsAt: Date; notes?: string; studentId?: string },
) {
  // Staff may book on behalf of a student; everyone else books for themselves.
  const studentId = input.studentId && auth.can(P.BOOKINGS_MANAGE_ANY) ? input.studentId : auth.userId;

  const service = await prisma.service.findFirst({ where: { id: input.serviceId, isActive: true } });
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

  const booking = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.create({
      data: {
        studentId,
        tutorId: input.tutorId,
        serviceId: service.id,
        startsAt: input.startsAt,
        endsAt,
        blockedUntil: addMinutes(endsAt, service.bufferMinutes),
        status: 'CONFIRMED',
        studentNotes: input.notes,
      },
      include: bookingInclude,
    });
    await tx.sessionFeedPost.create({ data: { bookingId: b.id, authorId: auth.userId, kind: 'SYSTEM', message: 'Session booked' } });

    // Each party gets times in THEIR OWN timezone.
    await enqueueEmail(b.student.email, 'booking_confirmed', {
      serviceName: b.service.name,
      otherPartyName: fullName(b.tutor),
      when: formatForUser(b.startsAt, b.student.timezone),
    }, { tx });
    await enqueueEmail(b.tutor.email, 'booking_confirmed', {
      serviceName: b.service.name,
      otherPartyName: fullName(b.student),
      when: formatForUser(b.startsAt, b.tutor.timezone),
    }, { tx });
    return b;
  });

  await audit(auth.userId, 'booking.created', 'booking', booking.id);
  return booking;
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
  return { total, items };
}

export async function cancelBooking(auth: Auth, id: string, reason?: string) {
  const b = await getBookingForParticipant(auth, id);
  if (!ACTIVE.includes(b.status)) throw Conflict('This booking is not active', 'NOT_CANCELLABLE');

  const isStaff = auth.can(P.BOOKINGS_MANAGE_ANY);
  const isParticipant = b.studentId === auth.userId || b.tutorId === auth.userId;
  if (!isStaff && !(isParticipant && auth.can(P.BOOKINGS_CANCEL_OWN))) throw Forbidden();

  // Students must respect the cancellation cutoff; tutors and staff need not.
  if (!isStaff && b.studentId === auth.userId) {
    const cutoff = b.startsAt.getTime() - env.STUDENT_CANCEL_CUTOFF_HOURS * 3_600_000;
    if (Date.now() > cutoff) {
      throw Conflict(`Sessions can only be cancelled up to ${env.STUDENT_CANCEL_CUTOFF_HOURS}h in advance`, 'CANCEL_CUTOFF');
    }
  }

  const actor = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { firstName: true, lastName: true } });

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: auth.userId, cancelReason: reason },
    });
    await tx.sessionFeedPost.create({
      data: { bookingId: id, authorId: auth.userId, kind: 'SYSTEM', message: `Cancelled${reason ? `: ${reason}` : ''}` },
    });
    const common = { serviceName: b.service.name, cancelledByName: fullName(actor), reason };
    await enqueueEmail(b.student.email, 'booking_cancelled', { ...common, otherPartyName: fullName(b.tutor), when: formatForUser(b.startsAt, b.student.timezone) }, { tx });
    await enqueueEmail(b.tutor.email, 'booking_cancelled', { ...common, otherPartyName: fullName(b.student), when: formatForUser(b.startsAt, b.tutor.timezone) }, { tx });
  });

  await audit(auth.userId, 'booking.cancelled', 'booking', id, { reason });
}

/** Tutor (or staff) marks the outcome after the session. */
export async function setOutcome(auth: Auth, id: string, status: 'COMPLETED' | 'NO_SHOW') {
  const b = await getBookingForParticipant(auth, id);
  if (b.tutorId !== auth.userId && !auth.can(P.BOOKINGS_MANAGE_ANY)) throw Forbidden('Only the tutor can record the outcome');
  if (b.status !== 'CONFIRMED') throw Conflict('Only confirmed sessions can be closed');
  if (b.startsAt > new Date()) throw Conflict('The session has not started yet');
  await prisma.booking.update({ where: { id }, data: { status } });
  await audit(auth.userId, `booking.${status.toLowerCase()}`, 'booking', id);
}
