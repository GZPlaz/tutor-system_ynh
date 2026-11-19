/**
 * Bootstrap (or recover) an administrator account.
 *
 *   npm run admin:create                       # uses SEED_ADMIN_EMAIL from .env
 *   npm run admin:create -- someone@example.com
 *
 * Creates the user as ACTIVE with the admin role (or promotes an existing
 * user), then prints a one-time "set your password" link. No password is ever
 * passed on the command line or stored in shell history.
 */
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { syncRbac } from '../modules/rbac/rbac.service.js';
import { createPasswordToken } from '../modules/auth/auth.service.js';

async function main() {
  const email = (process.argv[2] ?? env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!email) throw new Error('Pass an email or set SEED_ADMIN_EMAIL');

  await syncRbac();
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'admin' } });

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      firstName: env.SEED_ADMIN_FIRST_NAME,
      lastName: env.SEED_ADMIN_LAST_NAME,
      status: 'ACTIVE',
      approvedAt: new Date(),
      timezone: 'America/Chicago',
    },
    update: { status: 'ACTIVE', isGuest: false },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    create: { userId: user.id, roleId: adminRole.id },
    update: {},
  });

  const token = await createPasswordToken(user.id, 24 * 60);
  // eslint-disable-next-line no-console
  console.log(`\n✅ ${email} is an administrator.\n\nSet the password (valid 24h):\n${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}\n`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
