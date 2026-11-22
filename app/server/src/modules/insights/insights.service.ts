/**
 * INSIGHTS — the numbers an administrator needs to run the service, plus CSV exports.
 * Everything is computed on demand from bookings, feedback, users and messages, so
 * there is nothing to keep in sync. Weeks start on Monday (UTC).
 */
import { prisma } from '../../lib/prisma.js';
import { toCsv } from '../../lib/csv.js';
import { audit } from '../audit/audit.service.js';

type Auth = Express.AuthContext;
const name = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

function mondayUtc(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

export async function overview(weeks: number) {
  const now = new Date();
  const thisWeek = mondayUtc(now);
  const from = new Date(thisWeek.getTime() - (weeks - 1) * 7 * 864e5);
  const inPeriod = { startsAt: { gte: from, lte: now } };

  const [weeklyRows, byStatus, upcoming, ratings, newPeople, activeStudents, messages, downloads, subjects, tutors, recent] = await Promise.all([
    prisma.$queryRaw<{ week: Date; completed: number; missed: number; cancelled: number }[]>`
      SELECT date_trunc('week', starts_at AT TIME ZONE 'UTC') AS week,
             count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
             count(*) FILTER (WHERE status = 'NO_SHOW')::int AS missed,
             count(*) FILTER (WHERE status IN ('CANCELLED', 'DECLINED'))::int AS cancelled
      FROM bookings WHERE starts_at >= ${from} AND starts_at <= ${now}
      GROUP BY 1 ORDER BY 1`,
    prisma.booking.groupBy({ by: ['status'], where: inPeriod, _count: { _all: true } }),
    prisma.booking.count({ where: { status: 'CONFIRMED', startsAt: { gt: now } } }),
    prisma.sessionFeedback.aggregate({ where: { booking: inPeriod }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.user.count({ where: { createdAt: { gte: from }, isGuest: false, deletedAt: null } }),
    prisma.booking.findMany({ where: { ...inPeriod, status: 'COMPLETED' }, distinct: ['studentId'], select: { studentId: true } }),
    prisma.message.count({ where: { createdAt: { gte: from } } }),
    prisma.studyPacket.aggregate({ _sum: { downloadCount: true } }),
    prisma.$queryRaw<{ service: string; completed: number; booked: number }[]>`
      SELECT s.name AS service,
             count(*) FILTER (WHERE b.status = 'COMPLETED')::int AS completed,
             count(*)::int AS booked
      FROM bookings b JOIN services s ON s.id = b.service_id
      WHERE b.starts_at >= ${from} AND b.starts_at <= ${now}
      GROUP BY s.name ORDER BY completed DESC, booked DESC LIMIT 10`,
    prisma.$queryRaw<{ tutor: string; completed: number; missed: number; rating: number | null; ratings: number }[]>`
      SELECT u.first_name || ' ' || u.last_name AS tutor,
             count(*) FILTER (WHERE b.status = 'COMPLETED')::int AS completed,
             count(*) FILTER (WHERE b.status = 'NO_SHOW')::int AS missed,
             round(avg(f.rating)::numeric, 2)::float AS rating,
             count(f.id)::int AS ratings
      FROM bookings b JOIN users u ON u.id = b.tutor_id
      LEFT JOIN session_feedback f ON f.booking_id = b.id
      WHERE b.starts_at >= ${from} AND b.starts_at <= ${now}
      GROUP BY u.id, u.first_name, u.last_name ORDER BY completed DESC LIMIT 20`,
    prisma.sessionFeedback.findMany({
      where: { comment: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        rating: true, comment: true, updatedAt: true,
        booking: { select: { startsAt: true, service: { select: { name: true } }, tutor: { select: { firstName: true, lastName: true } } } },
      },
    }),
  ]);

  const count = (...st: string[]) => byStatus.filter((r) => st.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
  const completed = count('COMPLETED');
  const missed = count('NO_SHOW');
  const cancelled = count('CANCELLED', 'DECLINED');
  const scheduled = completed + missed + cancelled;

  // One row per week, including weeks with no sessions.
  const byWeek = new Map(weeklyRows.map((r) => [mondayUtc(new Date(r.week)).toISOString(), r]));
  const weekly = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(from.getTime() + i * 7 * 864e5).toISOString();
    const r = byWeek.get(start);
    return { weekStart: start, completed: r?.completed ?? 0, missed: r?.missed ?? 0, cancelled: r?.cancelled ?? 0 };
  });

  return {
    period: { from, to: now, weeks },
    totals: {
      completed,
      upcoming,
      missedRate: completed + missed ? missed / (completed + missed) : null,
      cancelRate: scheduled ? cancelled / scheduled : null,
      averageRating: ratings._avg.rating,
      ratings: ratings._count._all,
      newPeople,
      activeStudents: activeStudents.length,
      messages,
      packetDownloads: downloads._sum.downloadCount ?? 0,
    },
    weekly,
    subjects,
    tutors,
    recentFeedback: recent.map((f) => ({
      rating: f.rating,
      comment: f.comment,
      at: f.updatedAt,
      service: f.booking.service.name,
      tutor: name(f.booking.tutor),
      sessionAt: f.booking.startsAt,
    })),
  };
}

export async function sessionsCsv(auth: Auth, from: Date, to: Date): Promise<string> {
  const rows = await prisma.booking.findMany({
    where: { startsAt: { gte: from, lte: to } },
    orderBy: { startsAt: 'asc' },
    take: 50_000,
    select: {
      id: true, startsAt: true, endsAt: true, status: true, recapPostedAt: true,
      service: { select: { name: true } },
      tutor: { select: { firstName: true, lastName: true, email: true } },
      student: { select: { firstName: true, lastName: true, email: true, isGuest: true } },
      feedback: { select: { rating: true } },
    },
  });
  await audit(auth.userId, 'export.sessions', 'booking', null, { from, to, rows: rows.length });
  return toCsv(
    ['Session ID', 'Starts (UTC)', 'Ends (UTC)', 'Subject', 'Tutor', 'Tutor email', 'Student', 'Student email', 'Guest booking', 'Status', 'Recap written', 'Rating'],
    rows.map((b) => [
      b.id, b.startsAt, b.endsAt, b.service.name, name(b.tutor), b.tutor.email, name(b.student), b.student.email,
      b.student.isGuest ? 'yes' : 'no', b.status, b.recapPostedAt ? 'yes' : 'no', b.feedback?.rating ?? '',
    ]),
  );
}

export async function peopleCsv(auth: Auth): Promise<string> {
  const rows = await prisma.user.findMany({
    where: { deletedAt: null, isGuest: false },
    orderBy: { createdAt: 'asc' },
    select: { firstName: true, lastName: true, email: true, status: true, timezone: true, createdAt: true, lastLoginAt: true, roles: { select: { role: { select: { name: true } } } } },
  });
  await audit(auth.userId, 'export.people', 'user', null, { rows: rows.length });
  return toCsv(
    ['Name', 'Email', 'Roles', 'Status', 'Time zone', 'Joined (UTC)', 'Last sign-in (UTC)'],
    rows.map((u) => [name(u), u.email, u.roles.map((r) => r.role.name).join('; '), u.status, u.timezone, u.createdAt, u.lastLoginAt ?? '']),
  );
}
