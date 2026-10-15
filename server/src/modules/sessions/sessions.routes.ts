/**
 * /api/sessions
 *   GET  /feed                         ?pastHours=24&aheadDays=14
 *   POST /:bookingId/meeting-link      { meetingUrl, message? }   tutor only
 *   POST /:bookingId/notes             { message }                participants
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { P } from '../rbac/permissions.js';
import { GOOGLE_MEET_URL, getFeed, postMeetingLink, postNote } from './sessions.service.js';

export const sessionsRouter = Router();
sessionsRouter.use(authenticate);

const BookingParams = z.object({ bookingId: z.string().uuid() });

const FeedQuery = z.object({
  pastHours: z.coerce.number().int().min(0).max(24 * 30).default(24),
  aheadDays: z.coerce.number().int().min(1).max(60).default(14),
});

const LinkBody = z.object({
  meetingUrl: z.string().trim().regex(GOOGLE_MEET_URL, 'Paste a Google Meet link like https://meet.google.com/abc-defg-hij'),
  message: z.string().trim().max(500).optional(),
});

sessionsRouter.get('/feed', requirePermission(P.SESSIONS_VIEW_FEED), validate({ query: FeedQuery }), async (req, res) => {
  res.json(await getFeed(authOf(req), parsed(req, 'query', FeedQuery)));
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
