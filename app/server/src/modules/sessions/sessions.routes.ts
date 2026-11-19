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
import { GOOGLE_MEET_URL, listSessions, postMeetingLink, postNote, sessionCounts } from './sessions.service.js';

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
