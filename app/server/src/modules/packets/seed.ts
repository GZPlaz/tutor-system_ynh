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
  {
    seedKey: "act-math-algebra-functions-2",
    file: "act-math-algebra-functions.pdf",
    title: "ACT Math: Algebra & Functions",
    subject: "ACT Math",
    description: "Two pages of lessons with worked examples, then 30 practice questions on equations, systems, quadratics, exponents and functions, with a full answer key and explanations.",
    pageCount: 10,
    sortOrder: 1,
  },
  {
    seedKey: "act-math-geometry-trig-3",
    file: "act-math-geometry-trig.pdf",
    title: "ACT Math: Geometry & Trigonometry",
    subject: "ACT Math",
    description: "Two pages of geometry and trig lessons with worked examples, then 30 practice questions on angles, triangles, circles, solids and trigonometry, with explanations.",
    pageCount: 10,
    sortOrder: 2,
  },
  {
    seedKey: "act-math-stats-probability-4",
    file: "act-math-stats-probability.pdf",
    title: "ACT Math: Statistics, Probability & Numbers",
    subject: "ACT Math",
    description: "Lessons on statistics, probability, counting, percents, ratios and number properties, then 30 practice questions with a full answer key and explanations.",
    pageCount: 10,
    sortOrder: 3,
  },
  {
    seedKey: "act-math-advanced-topics-5",
    file: "act-math-advanced-topics.pdf",
    title: "ACT Math: Advanced Topics Challenge",
    subject: "ACT Math",
    description: "Lessons on logarithms, complex numbers, matrices, sequences, conics, vectors, polynomials and trig, then 30 challenge questions with worked explanations.",
    pageCount: 10,
    sortOrder: 4,
  },
  {
    seedKey: "act-english-punctuation-2",
    file: "act-english-punctuation.pdf",
    title: "ACT English: Punctuation Power",
    subject: "ACT English",
    description: "Two pages of punctuation rules with examples, then five passages with 30 questions on commas, semicolons, colons, dashes and apostrophes, with explanations.",
    pageCount: 10,
    sortOrder: 1,
  },
  {
    seedKey: "act-english-grammar-usage-3",
    file: "act-english-grammar-usage.pdf",
    title: "ACT English: Grammar & Usage",
    subject: "ACT English",
    description: "Lessons on agreement, verb tense, pronouns, modifiers, parallelism and comparisons, then five passages with 30 questions and an explanation for every answer.",
    pageCount: 10,
    sortOrder: 2,
  },
  {
    seedKey: "act-english-rhetorical-skills-4",
    file: "act-english-rhetorical-skills.pdf",
    title: "ACT English: Rhetorical Skills",
    subject: "ACT English",
    description: "Lessons on transitions, relevance, concision, tone, sentence order and purpose questions, then five passages with 30 questions and full explanations.",
    pageCount: 10,
    sortOrder: 3,
  },
  {
    seedKey: "act-english-mixed-practice-5",
    file: "act-english-mixed-practice.pdf",
    title: "ACT English: Mixed Timed Practice",
    subject: "ACT English",
    description: "A review of the most-tested rules, then five passages with 30 mixed grammar, punctuation and rhetorical-skills questions to do under time, with full explanations.",
    pageCount: 10,
    sortOrder: 4,
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
