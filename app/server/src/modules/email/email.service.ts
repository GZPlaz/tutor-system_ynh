/**
 * Email OUTBOX pattern
 * --------------------
 * Business code never talks to SMTP directly. It calls `enqueueEmail()`, which
 * inserts a row into `email_outbox` — optionally inside the same DB
 * transaction as the business change (pass `tx`). The worker below delivers
 * rows in the background with retries and exponential backoff.
 *
 * Why: an SMTP hiccup can never fail a booking or approval, emails are never
 * "sent for a booking that rolled back", and failures are visible in the DB.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { render, type TemplateKey } from './templates.js';
import { sendMail } from './mailer.js';
import { emailBrand } from '../settings/branding.js';

type Db = PrismaClient | Prisma.TransactionClient;

const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 20;

export async function enqueueEmail(
  to: string,
  template: TemplateKey,
  payload: Record<string, unknown>,
  opts: { tx?: Db; sendAfter?: Date } = {},
): Promise<void> {
  render(template, payload); // fail fast on a broken template/payload
  await (opts.tx ?? prisma).emailOutbox.create({
    data: { toEmail: to, template, payload: payload as Prisma.InputJsonValue, sendAfter: opts.sendAfter },
  });
}

/** Email every ACTIVE user holding `permissionKey` (e.g. all approvers). */
export async function enqueueToPermissionHolders(
  permissionKey: string,
  template: TemplateKey,
  payload: Record<string, unknown>,
  tx?: Db,
): Promise<void> {
  const db = tx ?? prisma;
  const recipients = await db.user.findMany({
    where: {
      status: 'ACTIVE',
      roles: { some: { role: { permissions: { some: { permission: { key: permissionKey } } } } } },
    },
    select: { email: true },
  });
  for (const r of recipients) await enqueueEmail(r.email, template, payload, { tx: db });
}

/**
 * Deliver due emails. Rows are claimed with FOR UPDATE SKIP LOCKED so this is
 * safe even if two workers ever run concurrently.
 */
export async function processOutbox(): Promise<number> {
  const due = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM email_outbox
      WHERE status = 'PENDING' AND send_after <= now()
      ORDER BY send_after
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED`;
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    // Push send_after forward as a lease so a crash mid-send doesn't double-send immediately.
    await tx.emailOutbox.updateMany({ where: { id: { in: ids } }, data: { sendAfter: new Date(Date.now() + 5 * 60_000) } });
    return tx.emailOutbox.findMany({ where: { id: { in: ids } } });
  });

  const brand = due.length ? await emailBrand() : undefined; // admin's Branding settings
  for (const row of due) {
    try {
      const mail = render(row.template, row.payload as Record<string, unknown>, brand);
      await sendMail({ to: row.toEmail, ...mail });
      await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } } });
    } catch (err) {
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      const backoffMin = Math.min(2 ** attempts, 120); // 2,4,8,16,32,64 min
      logger.warn({ err, id: row.id, attempts }, failed ? 'Email permanently failed' : 'Email send failed, will retry');
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          attempts,
          status: failed ? 'FAILED' : 'PENDING',
          lastError: err instanceof Error ? err.message.slice(0, 1000) : String(err),
          sendAfter: new Date(Date.now() + backoffMin * 60_000),
        },
      });
    }
  }
  return due.length;
}
