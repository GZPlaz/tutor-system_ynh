/**
 * Centralised, validated configuration.
 *
 * Everything the app reads from the environment goes through this schema so a
 * typo or missing secret fails loudly at boot instead of at 2am in production.
 * Add new settings here first, then use `env.X` anywhere in the codebase.
 */
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3105),
  HOST: z.string().default('127.0.0.1'),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TTL_MIN: z.coerce.number().int().positive().default(60),
  INVITE_TTL_HOURS: z.coerce.number().int().positive().default(72),
  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: bool.default(true),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('MindAccel Tutoring <no-reply@example.com>'),
  EMAIL_ENABLED: bool.default(false),

  BOOKING_MIN_LEAD_HOURS: z.coerce.number().min(0).default(12),
  BOOKING_MAX_HORIZON_DAYS: z.coerce.number().int().positive().default(60),
  BOOKING_SLOT_STEP_MIN: z.coerce.number().int().positive().default(15),
  STUDENT_CANCEL_CUTOFF_HOURS: z.coerce.number().min(0).default(24),
  MEETING_LINK_NUDGE_MIN: z.coerce.number().int().positive().default(15),

  /** Built web app (client/dist). Express serves it, so the app needs no web server config of its own. */
  CLIENT_DIST_DIR: z.string().default('../client/dist'),

  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(25),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_FIRST_NAME: z.string().default('Admin'),
  SEED_ADMIN_LAST_NAME: z.string().default('User'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

/** URL path prefix the app is served under, e.g. "" or "/tutoring". */
const basePath = new URL(raw.APP_URL).pathname.replace(/\/+$/, '');

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  basePath,
  /** Public origin, e.g. https://app.mindaccel.org (used for CSRF origin checks). */
  appOrigin: new URL(raw.APP_URL).origin,
} as const;

export type Env = typeof env;
