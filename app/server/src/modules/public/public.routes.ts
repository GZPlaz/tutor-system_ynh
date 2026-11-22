/**
 * /api/public — endpoints that work WITHOUT signing in. They only answer when the
 * administrator has switched "Account needed to book" off (Admin → Settings);
 * otherwise they return 403 ACCOUNT_REQUIRED and the app shows the normal sign-in.
 *
 *  GET  /services                       bookable services
 *  GET  /slots?serviceId&from&to[&tutorId]
 *  POST /bookings                       { serviceId, tutorId, startsAt, firstName, lastName, email, timezone, notes?, acceptTerms, age }
 *  GET  /bookings/:id?t=<token>         the guest's own booking (token comes from their emails)
 *  POST /bookings/:id/cancel?t=<token>  { reason? }
 *
 * Guests are rate limited and a hidden "website" field catches simple bots.
 */
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { verifyGuestToken } from '../../lib/guestToken.js';
import { parsed, validate } from '../../middleware/validate.js';
import { ConsentFields, EmailSchema, TimezoneSchema } from '../auth/auth.schemas.js';
import * as svc from '../scheduling/scheduling.service.js';

export const publicRouter = Router();

const guestLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests from this network. Please try again later.' } },
});

const Uuid = z.string().uuid();
const IsoDate = z.coerce.date();

publicRouter.get('/services', async (_req, res) => {
  svc.assertGuestBookingOpen();
  res.json(await svc.listGuestServices());
});

const SlotsQuery = z.object({ serviceId: Uuid, from: IsoDate, to: IsoDate, tutorId: Uuid.optional() });
publicRouter.get('/slots', validate({ query: SlotsQuery }), async (req, res) => {
  svc.assertGuestBookingOpen();
  res.json(await svc.findSlotsFor(null, parsed(req, 'query', SlotsQuery)));
});

const GuestBookingBody = z.object({
  serviceId: Uuid,
  tutorId: Uuid,
  startsAt: IsoDate,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: EmailSchema,
  timezone: TimezoneSchema.default('UTC'),
  notes: z.string().trim().max(1000).optional(),
  website: z.string().max(200).optional(), // honeypot: real people never see or fill this
  ...ConsentFields,
});

publicRouter.post('/bookings', guestLimiter, validate({ body: GuestBookingBody }), async (req, res) => {
  const { website, acceptTerms: _accepted, ...input } = parsed(req, 'body', GuestBookingBody);
  if (website) throw BadRequest('Could not send this request');
  const booking = await svc.createGuestBooking(input);
  res.status(201).json({
    id: booking.id,
    status: booking.status,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    service: booking.service.name,
    tutorName: `${booking.tutor.firstName} ${booking.tutor.lastName}`,
  });
});

const IdParams = z.object({ id: Uuid });
const TokenQuery = z.object({ t: z.string().max(200) });

/** The signed link is the only credential; a wrong token looks exactly like a missing booking. */
function requireToken(req: { valid: { params?: unknown; query?: unknown } }): string {
  const { id } = req.valid.params as { id: string };
  const { t } = req.valid.query as { t: string };
  if (!verifyGuestToken(id, t)) throw NotFound('Booking');
  return id;
}

publicRouter.get('/bookings/:id', guestLimiter, validate({ params: IdParams, query: TokenQuery }), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await svc.getGuestBookingView(requireToken(req)));
});

publicRouter.post(
  '/bookings/:id/cancel',
  guestLimiter,
  validate({ params: IdParams, query: TokenQuery, body: z.object({ reason: z.string().trim().max(500).optional() }) }),
  async (req, res) => {
    const id = requireToken(req);
    await svc.cancelGuestBooking(id, (req.valid.body as { reason?: string }).reason);
    res.status(204).end();
  },
);
