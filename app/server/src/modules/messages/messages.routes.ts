/**
 * /api/messages
 *   GET  /summary                        { unread, openQuestions[] }   (nav badge, home page)
 *   GET  /contacts                       people I can start a thread with
 *   GET  /conversations?scope=mine|all   threads (scope=all: messages:read_any, read-only)
 *   POST /conversations                  { userId, relation? } → get or create the thread
 *   GET  /conversations/:id/messages?before=ISO
 *   POST /conversations/:id/messages     { body, replyToId? }
 *   POST /conversations/:id/read
 *   POST /questions                      { bookingId, body }   tutor asks about an upcoming session
 */
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { P } from '../rbac/permissions.js';
import * as svc from './messages.service.js';

export const messagesRouter = Router();
messagesRouter.use(authenticate);

const Uuid = z.string().uuid();
const IdParams = z.object({ id: Uuid });
const Body = z.string().trim().min(1, 'Write a message first').max(4000, 'Messages can be up to 4,000 characters');

/** Per person, not per network: a school's shared Wi-Fi must not block everyone. */
const sendLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? 'anonymous',
  message: { error: { code: 'RATE_LIMITED', message: "You're sending messages very quickly. Please wait a few minutes." } },
});

const canUse = requireAnyPermission(P.MESSAGES_SEND, P.MESSAGES_READ_ANY);

messagesRouter.get('/summary', canUse, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await svc.unreadSummary(authOf(req)));
});

messagesRouter.get('/contacts', requirePermission(P.MESSAGES_SEND), async (req, res) => {
  res.json(await svc.contactsFor(authOf(req)));
});

const ListQuery = z.object({ scope: z.enum(['mine', 'all']).default('mine') });
messagesRouter.get('/conversations', canUse, validate({ query: ListQuery }), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await svc.listConversations(authOf(req), parsed(req, 'query', ListQuery).scope));
});

const StartBody = z.object({ userId: Uuid, relation: z.enum(['tutor', 'student']).optional() });
messagesRouter.post('/conversations', requirePermission(P.MESSAGES_SEND), validate({ body: StartBody }), async (req, res) => {
  const { userId, relation } = parsed(req, 'body', StartBody);
  res.status(201).json(await svc.startConversation(authOf(req), userId, relation));
});

const PageQuery = z.object({ before: z.coerce.date().optional() });
messagesRouter.get('/conversations/:id/messages', canUse, validate({ params: IdParams, query: PageQuery }), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await svc.getMessages(authOf(req), parsed(req, 'params', IdParams).id, parsed(req, 'query', PageQuery).before));
});

const SendBody = z.object({ body: Body, replyToId: Uuid.optional() });
messagesRouter.post(
  '/conversations/:id/messages',
  requirePermission(P.MESSAGES_SEND),
  sendLimiter,
  validate({ params: IdParams, body: SendBody }),
  async (req, res) => {
    res.status(201).json(await svc.sendMessage(authOf(req), parsed(req, 'params', IdParams).id, parsed(req, 'body', SendBody)));
  },
);

messagesRouter.post('/conversations/:id/read', requirePermission(P.MESSAGES_SEND), validate({ params: IdParams }), async (req, res) => {
  await svc.markRead(authOf(req), parsed(req, 'params', IdParams).id);
  res.status(204).end();
});

const QuestionBody = z.object({ bookingId: Uuid, body: Body });
messagesRouter.post('/questions', requirePermission(P.MESSAGES_SEND), sendLimiter, validate({ body: QuestionBody }), async (req, res) => {
  const { bookingId, body } = parsed(req, 'body', QuestionBody);
  res.status(201).json(await svc.askQuestion(authOf(req), bookingId, body));
});
