/**
 * STUDENTS & NOTES — what tutors see about a student.
 *
 *  - Any tutor (students:read_notes) can open any student's profile and read every note,
 *    so whoever teaches them next knows the background.
 *  - Writing (students:write_notes) is limited to students you have taught, unless you
 *    can manage users (admins). Authors edit/delete their own notes; admins any.
 *  - Students see only SHARED notes about themselves (GET /students/me/notes).
 */
import type { NoteVisibility, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { Forbidden, NotFound } from '../../lib/errors.js';
import { audit } from '../audit/audit.service.js';
import { P } from '../rbac/permissions.js';

type Auth = Express.AuthContext;
const name = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

export async function listStudents(auth: Auth, q: { scope: 'mine' | 'all'; search?: string }) {
  const all = q.scope === 'all' && auth.can(P.USERS_READ);
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    isGuest: false,
    ...(all ? { roles: { some: { role: { key: 'student' } } } } : { bookingsAsStudent: { some: { tutorId: auth.userId } } }),
    ...(q.search ? { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}),
  };
  const now = new Date();
  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 300,
    select: {
      id: true, firstName: true, lastName: true, status: true, email: true,
      _count: { select: { notesAbout: true, bookingsAsStudent: { where: { tutorId: auth.userId, status: 'COMPLETED' } } } },
      bookingsAsStudent: {
        where: { status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { gt: now }, ...(all ? {} : { tutorId: auth.userId }) },
        orderBy: { startsAt: 'asc' },
        take: 1,
        select: { startsAt: true, service: { select: { name: true } } },
      },
    },
  });
  return rows.map((u) => ({
    id: u.id,
    name: name(u),
    email: auth.can(P.USERS_READ) ? u.email : undefined,
    status: u.status,
    notes: u._count.notesAbout,
    sessionsWithMe: u._count.bookingsAsStudent,
    next: u.bookingsAsStudent[0] ? { startsAt: u.bookingsAsStudent[0].startsAt, service: u.bookingsAsStudent[0].service.name } : null,
  }));
}

async function canWriteAbout(auth: Auth, studentId: string) {
  if (!auth.can(P.STUDENT_NOTES_WRITE)) return false;
  if (auth.can(P.USERS_MANAGE)) return true;
  return !!(await prisma.booking.findFirst({ where: { tutorId: auth.userId, studentId }, select: { id: true } }));
}

const noteSelect = {
  id: true, body: true, visibility: true, createdAt: true, updatedAt: true, authorId: true,
  author: { select: { firstName: true, lastName: true } },
} satisfies Prisma.StudentNoteSelect;

const presentNote = (auth: Auth) => (n: Prisma.StudentNoteGetPayload<{ select: typeof noteSelect }>) => ({
  id: n.id, body: n.body, visibility: n.visibility, createdAt: n.createdAt, updatedAt: n.updatedAt,
  author: name(n.author), mine: n.authorId === auth.userId,
  canEdit: n.authorId === auth.userId || auth.can(P.USERS_MANAGE),
});

export async function studentProfile(auth: Auth, id: string) {
  const u = await prisma.user.findFirst({
    where: { id, deletedAt: null, isGuest: false },
    select: { id: true, firstName: true, lastName: true, email: true, timezone: true, status: true, createdAt: true },
  });
  if (!u) throw NotFound('Student');
  const seeAll = auth.can(P.BOOKINGS_READ_ANY);
  const [notes, sessions, canWrite] = await Promise.all([
    prisma.studentNote.findMany({ where: { studentId: id }, orderBy: { createdAt: 'desc' }, select: noteSelect }),
    prisma.booking.findMany({
      where: { studentId: id, ...(seeAll ? {} : { tutorId: auth.userId }) },
      orderBy: { startsAt: 'desc' },
      take: 20,
      select: { id: true, startsAt: true, status: true, recap: true, service: { select: { name: true } }, tutor: { select: { firstName: true, lastName: true } }, feedback: { select: { rating: true } } },
    }),
    canWriteAbout(auth, id),
  ]);
  return {
    student: { id: u.id, name: name(u), email: auth.can(P.USERS_READ) ? u.email : undefined, timezone: u.timezone, status: u.status, memberSince: u.createdAt },
    notes: notes.map(presentNote(auth)),
    sessions: sessions.map((b) => ({ id: b.id, startsAt: b.startsAt, status: b.status, service: b.service.name, tutor: name(b.tutor), hasRecap: !!b.recap, rating: b.feedback?.rating ?? null })),
    sessionsScope: seeAll ? 'all' : 'mine',
    canWrite,
  };
}

export async function addNote(auth: Auth, studentId: string, input: { body: string; visibility: NoteVisibility }) {
  const exists = await prisma.user.findFirst({ where: { id: studentId, deletedAt: null, isGuest: false }, select: { id: true } });
  if (!exists) throw NotFound('Student');
  if (studentId === auth.userId) throw Forbidden("You can't write notes about yourself.");
  if (!(await canWriteAbout(auth, studentId))) throw Forbidden('You can add notes for students you have taught.');
  const n = await prisma.studentNote.create({ data: { studentId, authorId: auth.userId, ...input }, select: noteSelect });
  await audit(auth.userId, 'student_note.created', 'user', studentId, { noteId: n.id, visibility: input.visibility });
  return presentNote(auth)(n);
}

async function loadEditable(auth: Auth, noteId: string) {
  const n = await prisma.studentNote.findUnique({ where: { id: noteId }, select: { id: true, authorId: true, studentId: true } });
  if (!n) throw NotFound('Note');
  if (n.authorId !== auth.userId && !auth.can(P.USERS_MANAGE)) throw Forbidden('You can only change your own notes.');
  return n;
}

export async function updateNote(auth: Auth, noteId: string, data: { body?: string; visibility?: NoteVisibility }) {
  const n = await loadEditable(auth, noteId);
  const out = await prisma.studentNote.update({ where: { id: noteId }, data, select: noteSelect });
  await audit(auth.userId, 'student_note.updated', 'user', n.studentId, { noteId, ...('visibility' in data ? { visibility: data.visibility } : {}) });
  return presentNote(auth)(out);
}

export async function deleteNote(auth: Auth, noteId: string) {
  const n = await loadEditable(auth, noteId);
  await prisma.studentNote.delete({ where: { id: noteId } });
  await audit(auth.userId, 'student_note.deleted', 'user', n.studentId, { noteId });
}

/** What a student sees: shared notes about themselves. */
export async function myNotes(auth: Auth) {
  const rows = await prisma.studentNote.findMany({
    where: { studentId: auth.userId, visibility: 'SHARED' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, body: true, createdAt: true, updatedAt: true, author: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, updatedAt: n.updatedAt, author: name(n.author) }));
}
