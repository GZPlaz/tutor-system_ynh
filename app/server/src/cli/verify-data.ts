/**
 * Check that the data in this installation is complete and consistent — meant to be
 * run after importing the old My Webapp database:
 *
 *   mindaccel verify
 *
 * Reports what is in the database (so you can compare with the old site), which
 * database migrations have been applied, whether every uploaded Resource Hub file is
 * really on disk, and whether there is at least one administrator. Changes nothing.
 * Exit code 1 if something needs attention.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

const problems: string[] = [];
const line = (label: string, value: unknown) => console.log(`  ${label.padEnd(34)} ${value}`);
const bad = (msg: string) => {
  problems.push(msg);
  console.log(`  ✖ ${msg}`);
};

async function main() {
  console.log('\nMindAccel data check\n');

  console.log('Database');
  const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
    SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`;
  line('migrations applied', migrations.filter((m) => m.finished_at && !m.rolled_back_at).length);
  for (const m of migrations.filter((x) => !x.finished_at || x.rolled_back_at)) bad(`migration ${m.migration_name} did not finish`);
  const ext = await prisma.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname = 'btree_gist'`;
  if (!ext.length) bad('PostgreSQL extension btree_gist is missing (needed to stop double bookings)');
  const guards = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pg_constraint WHERE conname IN ('bookings_no_tutor_overlap', 'bookings_no_student_overlap')`;
  if (Number(guards[0]?.n ?? 0) !== 2) bad('the anti-double-booking constraints are missing from the bookings table');

  console.log('\nContents');
  const [users, guests, admins, pending, services, bookings, upcoming, resources, files, groups, payments, outbox] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null, isGuest: false } }),
    prisma.user.count({ where: { isGuest: true } }),
    prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: { key: 'admin' } } } } }),
    prisma.user.count({ where: { status: 'PENDING', deletedAt: null } }),
    prisma.service.count({ where: { deletedAt: null } }),
    prisma.booking.count(),
    prisma.booking.count({ where: { startsAt: { gt: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } } }),
    prisma.resource.count(),
    prisma.resource.findMany({ where: { type: 'FILE' }, select: { id: true, title: true, storageKey: true } }),
    prisma.group.count(),
    prisma.payment.count(),
    prisma.emailOutbox.count({ where: { status: 'PENDING' } }),
  ]);
  line('people (excluding guests)', users);
  line('guests (booked without account)', guests);
  line('active administrators', admins);
  line('sign-ups waiting for approval', pending);
  line('services', services);
  line('bookings (all time)', bookings);
  line('upcoming sessions', upcoming);
  line('classes', groups);
  line('resources (all kinds)', resources);
  line('past payments (history only)', payments);
  line('emails waiting to send', outbox);
  if (!admins) bad('there is no active administrator — run: mindaccel create-admin you@example.com');

  console.log('\nUploaded files');
  const root = path.resolve(env.UPLOAD_DIR);
  line('folder', root);
  let missing = 0;
  for (const f of files) {
    if (f.storageKey && !existsSync(path.join(root, f.storageKey))) {
      missing++;
      if (missing <= 10) console.log(`    missing: "${f.title}" (${f.storageKey})`);
    }
  }
  line('files in the database', files.length);
  if (missing) bad(`${missing} uploaded file(s) are in the database but not in the uploads folder — copy the old uploads folder over`);

  console.log(problems.length ? `\n✖ ${problems.length} thing(s) need attention.\n` : '\n✔ Everything looks consistent.\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (problems.length) process.exitCode = 1;
  });
