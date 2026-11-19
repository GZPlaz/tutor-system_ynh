/**
 * SITE SETTINGS — state + persistence (the pure rules live in model.ts).
 *
 * Settings are read on almost every request (some from synchronous code), so the
 * current values live in memory (`settings()`), are reloaded at boot, after every
 * save, and every 30 s by a background job (so a change made by another process,
 * e.g. a data import, shows up without a restart).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { applyPatch, defaultSettings, resolveSettings, SettingsSchema, type Settings, type SettingsPatch } from './model.js';

export * from './model.js';

const KEY = 'general';
let current: Settings = defaultSettings();

/** Current settings, synchronously. Loaded at boot; never blocks a request. */
export function settings(): Settings {
  return current;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
    current = resolveSettings(row?.value);
  } catch (err) {
    logger.error({ err }, 'Could not load site settings; keeping the previous values');
  }
  return current;
}

export async function updateSettings(actorId: string, patch: SettingsPatch): Promise<Settings> {
  const next = applyPatch(await loadSettings(), patch);
  const valid = SettingsSchema.parse(next); // never persist something the rest of the app can't read
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: valid as Prisma.InputJsonValue, updatedById: actorId },
    update: { value: valid as Prisma.InputJsonValue, updatedById: actorId },
  });
  current = valid;
  return current;
}

export function maintenanceMessage(): string {
  return settings().maintenance.message || 'The site is temporarily unavailable. Please try again shortly.';
}
