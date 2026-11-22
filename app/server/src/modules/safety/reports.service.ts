/**
 * REPORTS ABOUT TUTORS — anyone signed in can report a tutor; admins with safety:manage
 * review them. The reporter's identity is visible to admins only. Filing a report emails
 * every admin who can review it.
 */
import type { ReportCategory, ReportStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../audit/audit.service.js';
import { enqueueToPermissionHolders } from '../email/email.service.js';
import { getAccessProfile } from '../rbac/rbac.service.js';
import { P } from '../rbac/permissions.js';

type Auth = Express.AuthContext;
const name = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  SAFETY: 'Safety or safeguarding concern',
  CONDUCT: 'Inappropriate behaviour or language',
  NO_SHOW: "Didn't show up or was very late",
  QUALITY: 'Poor quality of teaching',
  OTHER: 'Something else',
};

export async function fileReport(auth: Auth, input: { tutorId: string; bookingId?: string; category: ReportCategory; details: string }) {
  if (input.tutorId === auth.userId) throw BadRequest("You can't report yourself.");
  const tutor = await prisma.user.findFirst({ where: { id: input.tutorId, deletedAt: null }, select: { id: true, firstName: true, lastName: true } });
  if (!tutor) throw NotFound('Tutor');
  const access = await getAccessProfile(tutor.id);
  if (!access.roles.includes('tutor') && !access.permissions.has(P.SESSIONS_RUN)) throw BadRequest('You can only report tutors.');
  if (input.bookingId) {
    const b = await prisma.booking.findFirst({ where: { id: input.bookingId, tutorId: tutor.id, studentId: auth.userId }, select: { id: true } });
    if (!b) throw BadRequest('That session is not one of yours with this tutor.');
  }
  const reporter = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { firstName: true, lastName: true } });
  const report = await prisma.tutorReport.create({
    data: { tutorId: tutor.id, reporterId: auth.userId, bookingId: input.bookingId ?? null, category: input.category, details: input.details },
    select: { id: true },
  });
  await enqueueToPermissionHolders(P.SAFETY_MANAGE, 'admin_new_report', {
    tutorName: name(tutor),
    reporterName: name(reporter),
    category: CATEGORY_LABEL[input.category],
    preview: input.details.length > 400 ? `${input.details.slice(0, 399)}…` : input.details,
  });
  await audit(auth.userId, 'report.filed', 'tutor_report', report.id, { tutorId: tutor.id, category: input.category });
  return report;
}

export async function listReports(q: { status?: ReportStatus; tutorId?: string }) {
  const rows = await prisma.tutorReport.findMany({
    where: { status: q.status, tutorId: q.tutorId },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    include: {
      tutor: { select: { id: true, firstName: true, lastName: true, status: true } },
      reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
      handledBy: { select: { firstName: true, lastName: true } },
      booking: { select: { id: true, startsAt: true, service: { select: { name: true } } } },
    },
  });
  const counts = await prisma.tutorReport.groupBy({ by: ['status'], _count: { _all: true } });
  return {
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    items: rows.map((r) => ({
      id: r.id,
      category: r.category,
      categoryLabel: CATEGORY_LABEL[r.category],
      details: r.details,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      handledAt: r.handledAt,
      handledBy: r.handledBy ? name(r.handledBy) : null,
      tutor: { id: r.tutor.id, name: name(r.tutor), status: r.tutor.status },
      reporter: { id: r.reporter.id, name: name(r.reporter), email: r.reporter.email },
      booking: r.booking ? { id: r.booking.id, startsAt: r.booking.startsAt, service: r.booking.service.name } : null,
    })),
  };
}

export async function updateReport(auth: Auth, id: string, data: { status?: ReportStatus; adminNote?: string | null }) {
  const r = await prisma.tutorReport.findUnique({ where: { id }, select: { id: true } });
  if (!r) throw NotFound('Report');
  await prisma.tutorReport.update({
    where: { id },
    data: { ...data, ...(data.status ? { handledById: auth.userId, handledAt: new Date() } : {}) },
  });
  await audit(auth.userId, 'report.updated', 'tutor_report', id, data);
}
