/**
 * BRANDING — how the site looks, editable by admins (settings:manage).
 *
 * Stored as one JSON document in app_settings (key "branding") and merged over
 * DEFAULT_BRANDING, so adding a new field later never breaks old data.
 * The SPA reads it publicly at startup (the sign-up page needs it before
 * anyone signs in) and turns it into CSS variables; emails use the name,
 * colour and logo too.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0E6E6A');

export const BrandingSchema = z.object({
  /** Shown in the header, browser tab and emails. */
  siteName: z.string().trim().min(1).max(60),
  /** Big headline on the welcome / sign-up page. */
  headline: z.string().trim().min(1).max(120),
  /** One or two sentences under the headline. */
  intro: z.string().trim().max(400),
  /** Up to three short reasons to join, listed on the welcome page. */
  highlights: z.array(z.string().trim().min(1).max(90)).max(3),
  /** Brand colour: buttons, links, the welcome panel. */
  primaryColor: Hex,
  /** Attention colour: badges for things waiting on someone. */
  accentColor: Hex,
  /** Font pairing (see client/src/lib/branding.ts). "system" loads no web fonts. */
  font: z.enum(['modern', 'studio', 'classic', 'friendly', 'system']),
  /** Corner style for buttons, fields and panels. */
  corners: z.enum(['rounded', 'soft', 'square']),
  /** Colour scheme: follow the visitor's device, or force light/dark. */
  theme: z.enum(['auto', 'light', 'dark']),
  /** Shown on the sign-up page and "pending approval" message. */
  supportEmail: z.union([z.string().trim().email().max(254), z.literal('')]),
  /** Show the graph-paper pattern on the welcome panel. */
  pattern: z.boolean(),
});

export type Branding = z.infer<typeof BrandingSchema>;

export const DEFAULT_BRANDING: Branding = {
  siteName: 'MindAccel Tutoring',
  headline: 'One-to-one tutoring that fits your week.',
  intro: 'Book live online sessions with our tutors, keep every worksheet in one place, and see exactly what is coming up next.',
  highlights: ['Live sessions on Google Meet', 'Pick times that suit you', 'All your materials in one place'],
  primaryColor: '#1F3A5F',
  accentColor: '#B7791F',
  font: 'modern',
  corners: 'soft',
  theme: 'auto',
  supportEmail: '',
  pattern: false,
};

/** What the public endpoint returns: settings + logo info. */
export interface PublicBranding extends Branding {
  logo: { version: number } | null;
}

interface Stored {
  branding?: Partial<Branding>;
  logo?: { ext: string; version: number } | null;
}

const KEY = 'branding';
let cache: { stored: Stored; at: number } | null = null;

async function readStored(): Promise<Stored> {
  if (cache && Date.now() - cache.at < 60_000) return cache.stored;
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const stored = (row?.value ?? {}) as Stored;
  cache = { stored, at: Date.now() };
  return stored;
}

async function writeStored(stored: Stored, actorId: string | null) {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: stored as Prisma.InputJsonValue, updatedById: actorId },
    update: { value: stored as Prisma.InputJsonValue, updatedById: actorId },
  });
  cache = { stored, at: Date.now() };
}

/** Defaults merged with saved values; invalid saved fields fall back to defaults. */
export async function getBranding(): Promise<PublicBranding> {
  const stored = await readStored();
  const merged = { ...DEFAULT_BRANDING, ...(stored.branding ?? {}) };
  const safe = BrandingSchema.safeParse(merged);
  return { ...(safe.success ? safe.data : DEFAULT_BRANDING), logo: stored.logo ? { version: stored.logo.version } : null };
}

export async function updateBranding(actorId: string, patch: Partial<Branding>): Promise<PublicBranding> {
  const stored = await readStored();
  await writeStored({ ...stored, branding: { ...(stored.branding ?? {}), ...patch } }, actorId);
  return getBranding();
}

export async function resetBranding(actorId: string): Promise<PublicBranding> {
  const stored = await readStored();
  await writeStored({ ...stored, branding: {} }, actorId);
  return getBranding();
}

export async function getLogoFile(): Promise<{ ext: string; version: number } | null> {
  return (await readStored()).logo ?? null;
}

export async function setLogo(actorId: string, logo: { ext: string } | null): Promise<PublicBranding> {
  const stored = await readStored();
  await writeStored({ ...stored, logo: logo ? { ext: logo.ext, version: Date.now() } : null }, actorId);
  return getBranding();
}

/** Values the email templates need. */
export async function emailBrand(): Promise<{ siteName: string; color: string; logoUrl: string | null }> {
  const b = await getBranding();
  return {
    siteName: b.siteName,
    color: b.primaryColor,
    logoUrl: b.logo ? `${env.APP_URL}/api/branding/logo?v=${b.logo.version}` : null,
  };
}
