/**
 * /api/scheduling
 *
 *  Services
 *   GET    /services                       active services (+ tutors)
 *   POST   /services                       services:manage
 *   PATCH  /services/:id                   services:manage
 *   PUT    /services/:id/tutors            services:manage  { tutorIds[] }
 *
 *  Availability (tutor's own, or anyone's with availability:manage_any)
 *   GET    /availability/:tutorId
 *   PUT    /availability/:tutorId/rules    replace weekly template
 *   POST   /availability/:tutorId/exceptions
 *   DELETE /availability/exceptions/:id
 *
 *  Booking
 *   GET    /slots?serviceId&from&to[&tutorId]   UTC ISO in, UTC ISO out
 *   GET    /bookings?scope=mine|all&from&to&status
 *   GET    /bookings/:id
 *   POST   /bookings                       { serviceId, tutorId, startsAt, notes? }
 *   POST   /bookings/:id/cancel            { reason? }
 *   POST   /bookings/:id/outcome           { status: COMPLETED | NO_SHOW }
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { requireEntitlement } from '../billing/entitlements.js';
import { TimezoneSchema } from '../auth/auth.schemas.js';
import { P } from '../rbac/permissions.js';
import * as svc from './scheduling.service.js';

export const schedulingRouter = Router();
schedulingRouter.use(authenticate);

const Uuid = z.string().uuid();
const IdParams = z.object({ id: Uuid });
const TutorParams = z.object({ tutorId: Uuid });
const IsoDate = z.coerce.date();

// ---- Services ---------------------------------------------------------------

const ServiceFields = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  durationMinutes: z.number().int().min(15).max(480),
  bufferMinutes: z.number().int().min(0).max(120),
  isActive: z.boolean(),
  priceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).toUpperCase(),
};

const ServiceBody = z.object({
  ...ServiceFields,
  bufferMinutes: ServiceFields.bufferMinutes.default(0),
  isActive: ServiceFields.isActive.default(true),
  currency: ServiceFields.currency.default('USD'),
});

// PATCH must not use defaults: zod's .partial() keeps them, which would silently
// reset omitted fields (e.g. re-activate a hidden service).
const ServiceUpdateBody = z.object(ServiceFields).partial();

// Note: z.coerce.boolean() would turn the string "false" into true, so parse explicitly.
const AllQuery = z.object({ all: z.enum(['true', 'false']).default('false').transform((v) => v === 'true') });

schedulingRouter.get('/services', validate({ query: AllQuery }), async (req, res) => {
  const { all } = req.valid.query as { all: boolean };
  res.json(await svc.listServices(all && authOf(req).can(P.SERVICES_MANAGE)));
});

schedulingRouter.post('/services', requirePermission(P.SERVICES_MANAGE), validate({ body: ServiceBody }), async (req, res) => {
  res.status(201).json(await svc.createService(parsed(req, 'body', ServiceBody)));
});

schedulingRouter.patch(
  '/services/:id',
  requirePermission(P.SERVICES_MANAGE),
  validate({ params: IdParams, body: ServiceUpdateBody }),
  async (req, res) => {
    res.json(await svc.updateService(parsed(req, 'params', IdParams).id, parsed(req, 'body', ServiceUpdateBody)));
  },
);

schedulingRouter.put(
  '/services/:id/tutors',
  requirePermission(P.SERVICES_MANAGE),
  validate({ params: IdParams, body: z.object({ tutorIds: z.array(Uuid) }) }),
  async (req, res) => {
    const { tutorIds } = req.valid.body as { tutorIds: string[] };
    await svc.setServiceTutors(parsed(req, 'params', IdParams).id, tutorIds);
    res.status(204).end();
  },
);

// ---- Availability -----------------------------------------------------------

const RuleBody = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    timezone: TimezoneSchema,
    effectiveFrom: IsoDate.optional(),
    effectiveTo: IsoDate.optional(),
  })
  .refine((r) => r.startMinute < r.endMinute, { message: 'Start must be before end' });

const RulesBody = z.object({ rules: z.array(RuleBody).max(100) });

const ExceptionBody = z
  .object({
    startsAt: IsoDate,
    endsAt: IsoDate,
    isAvailable: z.boolean().default(false),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((e) => e.startsAt < e.endsAt, { message: 'Start must be before end' });

schedulingRouter.get('/availability/:tutorId', validate({ params: TutorParams }), async (req, res) => {
  res.json(await svc.getAvailability(authOf(req), parsed(req, 'params', TutorParams).tutorId));
});

schedulingRouter.put('/availability/:tutorId/rules', validate({ params: TutorParams, body: RulesBody }), async (req, res) => {
  const { tutorId } = parsed(req, 'params', TutorParams);
  res.json(await svc.replaceWeeklyRules(authOf(req), tutorId, parsed(req, 'body', RulesBody).rules));
});

schedulingRouter.post(
  '/availability/:tutorId/exceptions',
  validate({ params: TutorParams, body: ExceptionBody }),
  async (req, res) => {
    const { tutorId } = parsed(req, 'params', TutorParams);
    res.status(201).json(await svc.addException(authOf(req), tutorId, parsed(req, 'body', ExceptionBody)));
  },
);

schedulingRouter.delete('/availability/exceptions/:id', validate({ params: IdParams }), async (req, res) => {
  await svc.deleteException(authOf(req), parsed(req, 'params', IdParams).id);
  res.status(204).end();
});

// ---- Slots & bookings -------------------------------------------------------

const SlotsQuery = z.object({ serviceId: Uuid, from: IsoDate, to: IsoDate, tutorId: Uuid.optional() });

schedulingRouter.get(
  '/slots',
  requireAnyPermission(P.BOOKINGS_CREATE, P.BOOKINGS_MANAGE_ANY),
  validate({ query: SlotsQuery }),
  async (req, res) => {
    res.json(await svc.findSlots(authOf(req), parsed(req, 'query', SlotsQuery)));
  },
);

const ListBookingsQuery = z.object({
  scope: z.enum(['mine', 'all']).default('mine'),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

schedulingRouter.get(
  '/bookings',
  requireAnyPermission(P.BOOKINGS_READ_OWN, P.BOOKINGS_READ_ANY),
  validate({ query: ListBookingsQuery }),
  async (req, res) => {
    res.json(await svc.listBookings(authOf(req), parsed(req, 'query', ListBookingsQuery)));
  },
);

schedulingRouter.get('/bookings/:id', validate({ params: IdParams }), async (req, res) => {
  res.json(await svc.getBookingForParticipant(authOf(req), parsed(req, 'params', IdParams).id));
});

const CreateBookingBody = z.object({
  serviceId: Uuid,
  tutorId: Uuid,
  startsAt: IsoDate,
  notes: z.string().trim().max(1000).optional(),
  studentId: Uuid.optional(), // staff booking on behalf of a student
});

schedulingRouter.post(
  '/bookings',
  requireAnyPermission(P.BOOKINGS_CREATE, P.BOOKINGS_MANAGE_ANY),
  requireEntitlement('sessions.book'), // no-op until BILLING_ENABLED=true
  validate({ body: CreateBookingBody }),
  async (req, res) => {
    res.status(201).json(await svc.createBooking(authOf(req), parsed(req, 'body', CreateBookingBody)));
  },
);

schedulingRouter.post(
  '/bookings/:id/cancel',
  validate({ params: IdParams, body: z.object({ reason: z.string().trim().max(500).optional() }) }),
  async (req, res) => {
    const { reason } = req.valid.body as { reason?: string };
    await svc.cancelBooking(authOf(req), parsed(req, 'params', IdParams).id, reason);
    res.status(204).end();
  },
);

schedulingRouter.post(
  '/bookings/:id/outcome',
  validate({ params: IdParams, body: z.object({ status: z.enum(['COMPLETED', 'NO_SHOW']) }) }),
  async (req, res) => {
    const { status } = req.valid.body as { status: 'COMPLETED' | 'NO_SHOW' };
    await svc.setOutcome(authOf(req), parsed(req, 'params', IdParams).id, status);
    res.status(204).end();
  },
);
