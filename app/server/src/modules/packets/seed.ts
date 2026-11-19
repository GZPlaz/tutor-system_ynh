/**
 * Packets that ship with the app (server/seed/packets/*.pdf).
 *
 * On start, each bundled packet that has never been added before is copied into
 * UPLOAD_DIR and listed on /packets. The keys already added are remembered in
 * app_settings ('packets.seeded'), so a packet an admin deletes stays deleted
 * after restarts and upgrades. Never throws: a missing file only logs a warning.
 */
import { randomUUID } from 'node:crypto';
import { copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { absolutePath } from '../resources/storage.js';

/** src/modules/packets (dev) and dist/modules/packets (build) are both three levels below server/. */
const SEED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../seed/packets');
const SETTING_KEY = 'packets.seeded';

export const BUNDLED_PACKETS = [
  {
    seedKey: 'act-math-practice-1',
    file: 'act-math-practice-packet.pdf',
    title: 'ACT Math Practice Packet',
    subject: 'ACT Math',
    description:
      'Strategy guide, 30 timed practice questions across algebra, geometry, functions, trigonometry and statistics, plus a full answer key with worked explanations.',
    pageCount: 7,
    sortOrder: 0,
  },
  {
    seedKey: 'act-english-practice-1',
    file: 'act-english-practice-packet.pdf',
    title: 'ACT English Practice Packet',
    subject: 'ACT English',
    description:
      'Grammar and punctuation rules that show up most on the ACT, three practice passages with 30 questions, and an answer key that explains every choice.',
    pageCount: 7,
    sortOrder: 0,
  },
] as const;

export async function seedBundledPackets(): Promise<void> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
    const done = new Set(Array.isArray(row?.value) ? (row.value as string[]) : []);
    const added: string[] = [];

    for (const p of BUNDLED_PACKETS) {
      if (done.has(p.seedKey)) continue;
      const source = path.join(SEED_DIR, p.file);
      const info = await stat(source).catch(() => null);
      if (!info) {
        logger.warn({ source }, 'Bundled study packet file is missing; skipping it');
        continue;
      }
      const existing = await prisma.studyPacket.findUnique({ where: { seedKey: p.seedKey } });
      if (!existing) {
        const storageKey = `${randomUUID()}.pdf`;
        await copyFile(source, absolutePath(storageKey));
        await prisma.studyPacket.create({
          data: {
            seedKey: p.seedKey,
            title: p.title,
            subject: p.subject,
            description: p.description,
            pageCount: p.pageCount,
            sortOrder: p.sortOrder,
            storageKey,
            originalName: p.file,
            mimeType: 'application/pdf',
            sizeBytes: info.size,
          },
        });
      }
      added.push(p.seedKey);
    }

    if (added.length) {
      const value = [...done, ...added];
      await prisma.appSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value }, update: { value } });
      logger.info({ added }, 'Added bundled study packets');
    }
  } catch (err) {
    logger.warn({ err }, 'Could not add the bundled study packets');
  }
}
