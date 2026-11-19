/**
 * SITE SETTINGS — the switches an administrator can change without touching the
 * server (Admin → Settings, permission `settings:manage`).
 *
 *   registration  can people create accounts, do those accounts need approval,
 *                 only from certain email domains, tell admins about new accounts
 *   booking       is an account needed to book, plus the scheduling rules that used
 *                 to live only in .env (lead time, horizon, step, cancel cutoff…)
 *   maintenance   lock everyone but administrators out while you work on the site
 *
 * Stored as one JSON document in app_settings (key "general") and merged over
 * defaults, so a new setting added later never breaks saved data. The defaults
 * reproduce the behaviour of earlier versions: approval required, account needed
 * to book, scheduling rules taken from .env.
 *
 * This file is the pure part (schemas, defaults, merging) so it can be unit-tested
 * without a database; general.ts holds the in-memory copy and the persistence.
 */
import { z } from 'zod';
import { env } from '../../config/env.js';

const Domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Use a domain such as school.org (no @ and no spaces)');

export const RegistrationSchema = z.object({
  /** Can visitors create their own account? Off = invitation only. */
  open: z.boolean(),
  /** New accounts wait for an administrator to approve them. Off = active straight away. */
  requireApproval: z.boolean(),
  /** If not empty, only these email domains may sign up. */
  allowedEmailDomains: z.array(Domain).max(50),
  /** Email people with the "approve users" permission when someone signs up. */
  notifyAdmins: z.boolean(),
});

export const BookingSchema = z.object({
  /** On: only signed-in people can book. Off: visitors can book with just a name and email. */
  requireAccount: z.boolean(),
  minLeadHours: z.number().min(0).max(24 * 30),
  maxHorizonDays: z.number().int().min(1).max(365),
  slotStepMinutes: z.number().int().min(5).max(120),
  studentCancelCutoffHours: z.number().min(0).max(24 * 30),
  meetingLinkNudgeMinutes: z.number().int().min(1).max(240),
});

export const MaintenanceSchema = z.object({
  enabled: z.boolean(),
  /** Shown to people who are locked out. */
  message: z.string().trim().max(300),
});

export const SettingsSchema = z.object({
  registration: RegistrationSchema,
  booking: BookingSchema,
  maintenance: MaintenanceSchema,
});

export const SettingsPatchSchema = z
  .object({
    registration: RegistrationSchema.partial(),
    booking: BookingSchema.partial(),
    maintenance: MaintenanceSchema.partial(),
  })
  .partial();

export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export function defaultSettings(): Settings {
  return {
    registration: { open: true, requireApproval: true, allowedEmailDomains: [], notifyAdmins: true },
    booking: {
      requireAccount: true,
      minLeadHours: env.BOOKING_MIN_LEAD_HOURS,
      maxHorizonDays: env.BOOKING_MAX_HORIZON_DAYS,
      slotStepMinutes: env.BOOKING_SLOT_STEP_MIN,
      studentCancelCutoffHours: env.STUDENT_CANCEL_CUTOFF_HOURS,
      meetingLinkNudgeMinutes: env.MEETING_LINK_NUDGE_MIN,
    },
    maintenance: { enabled: false, message: 'We are making improvements and will be back shortly.' },
  };
}

type Sections = keyof Settings;
const SECTION_SCHEMAS = { registration: RegistrationSchema, booking: BookingSchema, maintenance: MaintenanceSchema } as const;

/**
 * Defaults ← saved values. Each section is validated on its own: if one saved
 * section is damaged (hand-edited, or from a future version) only that section
 * falls back to its defaults, never the whole site.
 */
export function resolveSettings(stored: unknown, defaults: Settings = defaultSettings()): Settings {
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SECTION_SCHEMAS) as Sections[]) {
    const saved = raw[key] && typeof raw[key] === 'object' ? (raw[key] as object) : {};
    const merged = { ...defaults[key], ...saved };
    const parsed = SECTION_SCHEMAS[key].safeParse(merged);
    out[key] = parsed.success ? parsed.data : defaults[key];
  }
  return out as Settings;
}

/** Apply a partial update on top of the current values (sections merge field by field). */
export function applyPatch(current: Settings, patch: SettingsPatch): Settings {
  return {
    registration: { ...current.registration, ...(patch.registration ?? {}) },
    booking: { ...current.booking, ...(patch.booking ?? {}) },
    maintenance: { ...current.maintenance, ...(patch.maintenance ?? {}) },
  };
}

/** Does `email` belong to one of the allowed domains? An empty list allows everyone. */
export function emailDomainAllowed(email: string, allowed: readonly string[]): boolean {
  if (!allowed.length) return true;
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  return allowed.some((d) => domain === d.toLowerCase());
}
