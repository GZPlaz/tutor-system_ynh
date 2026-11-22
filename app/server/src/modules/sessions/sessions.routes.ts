/**
 * /api/sessions
 *   GET  /?view=upcoming|past&scope=mine|all&limit=   sessions with per-item `actions`
 *   GET  /counts                                     { requests, next24h } for nav badges
 *   GET  /feed                                       alias of ?view=upcoming (older clients)
 *   POST /:bookingId/meeting-link                    { meetingUrl, message? }  any time after confirming
 *   POST /:bookingId/notes                           { message }               participants
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { P } from '../rbac/permissions.js';
import { calendarRange, GOOGLE_MEET_URL, listSessions, postMeetingLink, postNote, sessionCounts } from './sessions.service.js';
import { calendarFeed, calendarFeedUrl, saveFeedback, saveRecap, sessionIcs } from './followup.service.js';
import { rateLimit } from 'express-rate-limit';

export const sessionsRouter = Router();
sessionsRouter.use(authenticate);

const BookingParams = z.object({ bookingId: z.string().uuid() });

const ListQuery = z.object({
  view: z.enum(['upcoming', 'past']).default('upcoming'),
  scope: z.enum(['mine', 'all']).default('mine'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const LinkBody = z.object({
  meetingUrl: z.string().trim().regex(GOOGLE_MEET_URL, 'Paste a Google Meet link like https://meet.google.com/abc-defg-hij'),
  message: z.string().trim().max(500).optional(),
});

sessionsRouter.get('/', requirePermission(P.SESSIONS_VIEW_FEED), validate({ query: ListQuery }), async (req, res) => {
  res.json(await listSessions(authOf(req), parsed(req, 'query', ListQuery)));
});

sessionsRouter.get('/feed', requirePermission(P.SESSIONS_VIEW_FEED), async (req, res) => {
  res.json(await listSessions(authOf(req), { view: 'upcoming', scope: 'mine', limit: 100 }));
});

sessionsRouter.get('/counts', async (req, res) => {
  res.json(await sessionCounts(authOf(req)));
});

sessionsRouter.post(
  '/:bookingId/meeting-link',
  requirePermission(P.SESSIONS_POST_LINK),
  validate({ params: BookingParams, body: LinkBody }),
  async (req, res) => {
    const { meetingUrl, message } = parsed(req, 'body', LinkBody);
    await postMeetingLink(authOf(req), parsed(req, 'params', BookingParams).bookingId, meetingUrl, message);
    res.status(204).end();
  },
);

sessionsRouter.post(
  '/:bookingId/notes',
  requirePermission(P.SESSIONS_VIEW_FEED),
  validate({ params: BookingParams, body: z.object({ message: z.string().trim().min(1).max(2000) }) }),
  async (req, res) => {
    const { message } = req.valid.body as { message: string };
    res.status(201).json(await postNote(authOf(req), parsed(req, 'params', BookingParams).bookingId, message));
  },
);

// ---- recaps, feedback, calendars -----------------------------------------------------

const RecapBody = z.object({ recap: z.string().trim().min(1, 'Write a short recap first').max(4000) });
sessionsRouter.put('/:bookingId/recap', requirePermission(P.SESSIONS_RUN), validate({ params: BookingParams, body: RecapBody }), async (req, res) => {
  res.json(await saveRecap(authOf(req), parsed(req, 'params', BookingParams).bookingId, parsed(req, 'body', RecapBody).recap));
});

const FeedbackBody = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() });
sessionsRouter.put('/:bookingId/feedback', requirePermission(P.SESSIONS_VIEW_FEED), validate({ params: BookingParams, body: FeedbackBody }), async (req, res) => {
  res.json(await saveFeedback(authOf(req), parsed(req, 'params', BookingParams).bookingId, parsed(req, 'body', FeedbackBody)));
});

sessionsRouter.get('/calendar-feed', requirePermission(P.SESSIONS_VIEW_FEED), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await calendarFeedUrl(authOf(req)));
});

sessionsRouter.post('/calendar-feed/reset', requirePermission(P.SESSIONS_VIEW_FEED), async (req, res) => {
  res.json(await calendarFeedUrl(authOf(req), true));
});

sessionsRouter.get('/:bookingId/calendar.ics', requirePermission(P.SESSIONS_VIEW_FEED), validate({ params: BookingParams }), async (req, res) => {
  const ics = await sessionIcs(authOf(req), parsed(req, 'params', BookingParams).bookingId);
  res.type('text/calendar').setHeader('Content-Disposition', 'attachment; filename="session.ics"');
  res.send(ics);
});

/** /api/public/calendar/:userId/:token.ics — polled by calendar apps, no sign-in. */
export const publicCalendarRouter = Router();
const feedLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
publicCalendarRouter.get(
  '/:userId/:file',
  feedLimiter,
  validate({ params: z.object({ userId: z.string().uuid(), file: z.string().regex(/^[\w-]{16,64}\.ics$/) }) }),
  async (req, res) => {
    const { userId, file } = req.valid.params as { userId: string; file: string };
    const ics = await calendarFeed(userId, file.replace(/\.ics$/, ''));
    res.type('text/calendar').setHeader('Cache-Control', 'private, max-age=300');
    res.send(ics);
  },
);

/** Bookings in a date range for the in-portal calendar. scope=all needs bookings:read_any. */
const CalQuery = z.object({ from: z.coerce.date(), to: z.coerce.date(), scope: z.enum(['mine', 'all']).default('mine'), tutorId: z.string().uuid().optional() });
sessionsRouter.get('/calendar/range', requirePermission(P.SESSIONS_VIEW_FEED), validate({ query: CalQuery }), async (req, res) => {
  const q = parsed(req, 'query', CalQuery);
  res.setHeader('Cache-Control', 'no-store');
  res.json(await calendarRange(authOf(req), q));
});
