/**
 * MESSAGING — private threads between a student and a tutor.
 *
 * Who can talk to whom (single source of truth: `contactsFor`):
 *   - a student can message any tutor who teaches an active service, or who they have booked
 *   - a tutor can message any student who has booked them
 *   - accounts must be ACTIVE; people who booked without an account (guests) can't sign in,
 *     so they are not offered
 * Staff with messages:read_any can read every thread (read-only) for safeguarding;
 * each such view is written to the activity log.
 *
 * Tutors can also ask a QUESTION about an upcoming session. It is highlighted for the
 * student (home page, session card, thread) until they answer it.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BadRequest, Forbidden, NotFound } from '../../lib/errors.js';
import { formatForUser } from '../../lib/time.js';
import { audit } from '../audit/audit.service.js';
import { enqueueEmail } from '../email/email.service.js';
import { P } from '../rbac/permissions.js';
import { canAskAbout, otherSide, preview, shouldEmail, sideOf, type Side } from './messaging.policy.js';

type Auth = Express.AuthContext;

const personSelect = { id: true, firstName: true, lastName: true, email: true, timezone: true, status: true, deletedAt: true, isGuest: true, emailOnMessage: true } as const;
const name = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
const reachable = (u: { status: string; deletedAt: Date | null; isGuest: boolean }) => u.status === 'ACTIVE' && !u.deletedAt && !u.isGuest;

// ---- contacts -----------------------------------------------------------------

export interface Contact {
  userId: string;
  name: string;
  /** What the OTHER person is to me. */
  relation: 'tutor' | 'student';
  subjects: string[];
}

export async function contactsFor(auth: Auth): Promise<Contact[]> {
  const me = auth.userId;
  const activeUser = { status: 'ACTIVE' as const, deletedAt: null, isGuest: false, id: { not: me } };

  const [teaching, bookedTutors, bookedStudents] = await Promise.all([
    // Tutors of bookable services
    prisma.user.findMany({
      where: { ...activeUser, tutorServices: { some: { service: { isActive: true, deletedAt: null } } } },
      select: { id: true, firstName: true, lastName: true, tutorServices: { where: { service: { isActive: true, deletedAt: null } }, select: { service: { select: { name: true } } } } },
    }),
    // Tutors I have booked
    prisma.user.findMany({
      where: { ...activeUser, bookingsAsTutor: { some: { studentId: me } } },
      select: { id: true, firstName: true, lastName: true },
    }),
    // Students who booked me
    prisma.user.findMany({
      where: { ...activeUser, bookingsAsStudent: { some: { tutorId: me } } },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const out = new Map<string, Contact>();
  for (const t of [...teaching, ...bookedTutors]) {
    const subjects = 'tutorServices' in t ? (t.tutorServices as { service: { name: string } }[]).map((x) => x.service.name) : [];
    const prev = out.get(`tutor:${t.id}`);
    out.set(`tutor:${t.id}`, { userId: t.id, name: name(t), relation: 'tutor', subjects: prev?.subjects.length ? prev.subjects : subjects });
  }
  for (const s of bookedStudents) out.set(`student:${s.id}`, { userId: s.id, name: name(s), relation: 'student', subjects: [] });
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Get or create the thread with a contact. The relation decides who is "student" in it. */
export async function startConversation(auth: Auth, otherUserId: string, relation?: 'tutor' | 'student') {
  const contacts = await contactsFor(auth);
  const match = contacts.find((c) => c.userId === otherUserId && (!relation || c.relation === relation));
  if (!match) throw Forbidden('You can only message your tutors and students.');
  const pair = match.relation === 'tutor' ? { studentId: auth.userId, tutorId: otherUserId } : { studentId: otherUserId, tutorId: auth.userId };
  const c = await prisma.conversation.upsert({
    where: { studentId_tutorId: pair },
    create: pair,
    update: {},
    select: { id: true },
  });
  return c;
}

// ---- reading ----------------------------------------------------------------------

/** Unread messages per thread for one user (messages from the other side after my last read). */
async function unreadByConversation(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ id: string; unread: number }[]>`
    SELECT c.id, count(m.id)::int AS unread
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
     AND m.sender_id <> ${userId}::uuid
     AND m.created_at > COALESCE(CASE WHEN c.student_id = ${userId}::uuid THEN c.student_last_read_at ELSE c.tutor_last_read_at END, 'epoch'::timestamptz)
    WHERE c.student_id = ${userId}::uuid OR c.tutor_id = ${userId}::uuid
    GROUP BY c.id`;
  return new Map(rows.map((r) => [r.id, r.unread]));
}

const conversationInclude = {
  student: { select: { id: true, firstName: true, lastName: true } },
  tutor: { select: { id: true, firstName: true, lastName: true } },
  messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, createdAt: true, senderId: true, kind: true } },
  _count: { select: { messages: { where: { kind: 'QUESTION', answeredAt: null } } } },
} satisfies Prisma.ConversationInclude;

export async function listConversations(auth: Auth, scope: 'mine' | 'all') {
  if (scope === 'all' && !auth.can(P.MESSAGES_READ_ANY)) throw Forbidden();
  const where: Prisma.ConversationWhereInput =
    scope === 'all' ? { messages: { some: {} } } : { OR: [{ studentId: auth.userId }, { tutorId: auth.userId }] };
  const [rows, unread] = await Promise.all([
    prisma.conversation.findMany({ where, include: conversationInclude, orderBy: { lastMessageAt: 'desc' }, take: 200 }),
    unreadByConversation(auth.userId),
  ]);
  return rows.map((c) => {
    const side = sideOf(c, auth.userId);
    const other = side === 'student' ? c.tutor : side === 'tutor' ? c.student : null;
    const last = c.messages[0];
    return {
      id: c.id,
      mySide: side, // null = staff viewing someone else's thread
      other: other ? { id: other.id, name: name(other), relation: side === 'student' ? 'tutor' : 'student' } : null,
      student: { id: c.student.id, name: name(c.student) },
      tutor: { id: c.tutor.id, name: name(c.tutor) },
      lastMessage: last ? { preview: preview(last.body, 120), at: last.createdAt, fromMe: last.senderId === auth.userId, kind: last.kind } : null,
      lastMessageAt: c.lastMessageAt,
      unread: unread.get(c.id) ?? 0,
      openQuestions: c._count.messages,
    };
  });
}

async function loadConversation(auth: Auth, id: string, need: 'read' | 'write') {
  const c = await prisma.conversation.findUnique({
    where: { id },
    include: { student: { select: personSelect }, tutor: { select: personSelect } },
  });
  if (!c) throw NotFound('Conversation');
  const side = sideOf(c, auth.userId);
  if (!side) {
    if (need === 'write' || !auth.can(P.MESSAGES_READ_ANY)) throw NotFound('Conversation'); // don't reveal it exists
  }
  return { c, side };
}

const messageSelect = {
  id: true,
  kind: true,
  body: true,
  createdAt: true,
  answeredAt: true,
  senderId: true,
  replyTo: { select: { id: true, body: true } },
  booking: { select: { id: true, startsAt: true, status: true, service: { select: { name: true } } } },
} satisfies Prisma.MessageSelect;

export async function getMessages(auth: Auth, conversationId: string, before?: Date) {
  const { c, side } = await loadConversation(auth, conversationId, 'read');
  const rows = await prisma.message.findMany({
    where: { conversationId, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: messageSelect,
  });
  if (!side) await audit(auth.userId, 'messages.viewed', 'conversation', conversationId, { student: c.studentId, tutor: c.tutorId });
  const other = side === 'student' ? c.tutor : c.student;
  return {
    conversation: {
      id: c.id,
      mySide: side,
      student: { id: c.student.id, name: name(c.student) },
      tutor: { id: c.tutor.id, name: name(c.tutor) },
      other: side ? { id: other.id, name: name(other), relation: side === 'student' ? 'tutor' : 'student', canReceive: reachable(other) } : null,
      otherLastReadAt: side === 'student' ? c.tutorLastReadAt : side === 'tutor' ? c.studentLastReadAt : null,
    },
    messages: rows.reverse().map((m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body,
      createdAt: m.createdAt,
      answeredAt: m.answeredAt,
      fromMe: m.senderId === auth.userId,
      fromSide: m.senderId === c.studentId ? 'student' : 'tutor',
      replyTo: m.replyTo ? { id: m.replyTo.id, preview: preview(m.replyTo.body, 140) } : null,
      booking: m.booking ? { id: m.booking.id, startsAt: m.booking.startsAt, status: m.booking.status, service: m.booking.service.name } : null,
    })),
    hasMore: rows.length === 50,
  };
}

export async function markRead(auth: Auth, conversationId: string) {
  const { side } = await loadConversation(auth, conversationId, 'write');
  await prisma.conversation.update({
    where: { id: conversationId },
    data: side === 'student' ? { studentLastReadAt: new Date() } : { tutorLastReadAt: new Date() },
  });
}

// ---- writing ------------------------------------------------------------------------

async function notify(
  conv: { id: string; studentNotifiedAt: Date | null; tutorNotifiedAt: Date | null; studentLastReadAt: Date | null; tutorLastReadAt: Date | null },
  to: Side,
  recipient: { email: string; status: string; deletedAt: Date | null; isGuest: boolean; emailOnMessage: boolean },
  kind: 'MESSAGE' | 'QUESTION',
  template: 'message_received' | 'session_question',
  payload: Record<string, unknown>,
  tx: Prisma.TransactionClient,
) {
  if (!reachable(recipient) || !recipient.emailOnMessage) return;
  const notifiedAt = to === 'student' ? conv.studentNotifiedAt : conv.tutorNotifiedAt;
  const lastReadAt = to === 'student' ? conv.studentLastReadAt : conv.tutorLastReadAt;
  if (!shouldEmail({ kind, notifiedAt, lastReadAt })) return;
  await enqueueEmail(recipient.email, template, payload, { tx });
  await tx.conversation.update({
    where: { id: conv.id },
    data: to === 'student' ? { studentNotifiedAt: new Date() } : { tutorNotifiedAt: new Date() },
  });
}

export async function sendMessage(auth: Auth, conversationId: string, input: { body: string; replyToId?: string }) {
  const { c, side } = await loadConversation(auth, conversationId, 'write');
  const me = side!;
  const recipient = me === 'student' ? c.tutor : c.student;
  if (!reachable(recipient)) throw BadRequest(`${name(recipient)} can't receive messages right now.`);
  const sender = me === 'student' ? c.student : c.tutor;

  let bookingId: string | null = null;
  if (input.replyToId) {
    const q = await prisma.message.findFirst({ where: { id: input.replyToId, conversationId }, select: { id: true, kind: true, senderId: true, answeredAt: true, bookingId: true } });
    if (!q || q.senderId === auth.userId) throw BadRequest('You can only reply to a message from the other person.');
    if (q.kind === 'QUESTION') bookingId = q.bookingId;
  }

  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: { conversationId, senderId: auth.userId, body: input.body, replyToId: input.replyToId ?? null, bookingId },
      select: { id: true },
    });
    if (input.replyToId) await tx.message.updateMany({ where: { id: input.replyToId, kind: 'QUESTION', answeredAt: null }, data: { answeredAt: now } });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, ...(me === 'student' ? { studentLastReadAt: now } : { tutorLastReadAt: now }) },
    });
    await notify(c, otherSide(me), recipient, 'MESSAGE', 'message_received', { fromName: name(sender), preview: preview(input.body), conversationId }, tx);
    return m;
  });
  return message;
}

export async function askQuestion(auth: Auth, bookingId: string, body: string) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { student: { select: personSelect }, tutor: { select: personSelect }, service: { select: { name: true } } },
  });
  if (!b || b.tutorId !== auth.userId) throw NotFound('Session');
  if (!canAskAbout(b, auth.userId)) throw BadRequest('You can only ask about upcoming sessions that are not cancelled.');
  if (!reachable(b.student)) throw BadRequest(`${name(b.student)} booked without an account, so they can't receive messages. Use the notes on the session instead.`);

  const pair = { studentId: b.studentId, tutorId: b.tutorId };
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const conv = await tx.conversation.upsert({ where: { studentId_tutorId: pair }, create: pair, update: {} });
    const m = await tx.message.create({
      data: { conversationId: conv.id, senderId: auth.userId, kind: 'QUESTION', body, bookingId },
      select: { id: true, conversationId: true },
    });
    await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: now, tutorLastReadAt: now } });
    await notify(conv, 'student', b.student, 'QUESTION', 'session_question', {
      tutorName: name(b.tutor),
      serviceName: b.service.name,
      when: formatForUser(b.startsAt, b.student.timezone),
      question: body,
      conversationId: conv.id,
    }, tx);
    return m;
  });
}

// ---- badges ---------------------------------------------------------------------------

export async function unreadSummary(auth: Auth) {
  const [unread, questions] = await Promise.all([
    unreadByConversation(auth.userId),
    prisma.message.findMany({
      where: { kind: 'QUESTION', answeredAt: null, conversation: { studentId: auth.userId }, booking: { endsAt: { gt: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        conversationId: true,
        sender: { select: { firstName: true, lastName: true } },
        booking: { select: { id: true, startsAt: true, service: { select: { name: true } } } },
      },
    }),
  ]);
  return {
    unread: [...unread.values()].reduce((a, b) => a + b, 0),
    openQuestions: questions.map((q) => ({
      messageId: q.id,
      conversationId: q.conversationId,
      tutorName: name(q.sender),
      bookingId: q.booking?.id ?? null,
      service: q.booking?.service.name ?? null,
      startsAt: q.booking?.startsAt ?? null,
    })),
  };
}
