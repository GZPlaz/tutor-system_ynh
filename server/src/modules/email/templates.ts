/**
 * Email templates. Each template is a pure function: payload → subject/html/text.
 * Payloads are stored as JSON in the outbox, so templates must only depend on
 * the payload (never query the DB) — that keeps retries deterministic.
 *
 * To add an email: add a key + renderer below, then call
 *   enqueueEmail(to, 'your_key', { ...payload })
 * All interpolated values are HTML-escaped by `esc()`.
 */
import { env } from '../../config/env.js';

const BRAND = 'MindAccel Tutoring';
const BRAND_COLOR = '#3B5BDB';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function link(path: string): string {
  return `${env.APP_URL}${path}`;
}

/** `title` is plain text (escaped here); `bodyHtml` must already be escaped. */
function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="background:${BRAND_COLOR};color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:10px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-weight:700;color:${BRAND_COLOR};font-size:15px">${BRAND}</p>
<h1 style="margin:0 0 16px;font-size:20px">${esc(title)}</h1>
${bodyHtml}
${button}
<p style="margin:32px 0 0;font-size:12px;color:#7b8794">You are receiving this because you have an account with ${BRAND}.</p>
</td></tr></table></td></tr></table></body></html>`;
}

const p = (text: string) => `<p style="margin:0 0 12px;line-height:1.55">${text}</p>`;

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

type Payload = Record<string, unknown>;

export const templates = {
  registration_received: (d: Payload): Rendered => ({
    subject: `We received your ${BRAND} registration`,
    html: layout(
      `Thanks for signing up, ${d.firstName}!`,
      p('Your account is now <strong>pending approval</strong>. An administrator will review it shortly and you will get an email as soon as you can sign in.'),
    ),
    text: `Thanks for signing up, ${d.firstName}! Your account is pending approval. We'll email you once it's approved.`,
  }),

  admin_new_registration: (d: Payload): Rendered => ({
    subject: `New student registration: ${d.studentName}`,
    html: layout(
      'A new registration needs your approval',
      p(`<strong>${esc(d.studentName)}</strong> (${esc(d.studentEmail)}) registered and is waiting for approval.`),
      { label: 'Review pending accounts', url: link('/admin/approvals') },
    ),
    text: `${d.studentName} (${d.studentEmail}) registered and is awaiting approval: ${link('/admin/approvals')}`,
  }),

  account_approved: (d: Payload): Rendered => ({
    subject: `Your ${BRAND} account is approved`,
    html: layout(
      `Welcome aboard, ${d.firstName}!`,
      p('Your account has been approved. You can now sign in, book sessions and access your learning resources.'),
      { label: 'Sign in', url: link('/login') },
    ),
    text: `Welcome, ${d.firstName}! Your account is approved. Sign in: ${link('/login')}`,
  }),

  account_rejected: (d: Payload): Rendered => ({
    subject: `About your ${BRAND} registration`,
    html: layout(
      `Hi ${d.firstName},`,
      p('Unfortunately we could not approve your registration at this time.') +
        (d.reason ? p(`Reason: ${esc(d.reason)}`) : '') +
        p('If you think this is a mistake, simply reply to this email.'),
    ),
    text: `Hi ${d.firstName}, we could not approve your registration.${d.reason ? ` Reason: ${d.reason}` : ''}`,
  }),

  invite: (d: Payload): Rendered => ({
    subject: `You're invited to ${BRAND}`,
    html: layout(
      `Hi ${d.firstName}, your account is ready`,
      p(`An administrator created a <strong>${esc(d.roleName)}</strong> account for you. Choose a password to get started — this link expires in ${esc(d.expiresInHours)} hours.`),
      { label: 'Set your password', url: link(`/reset-password?token=${encodeURIComponent(String(d.token))}`) },
    ),
    text: `Set your password: ${link(`/reset-password?token=${encodeURIComponent(String(d.token))}`)}`,
  }),

  password_reset: (d: Payload): Rendered => ({
    subject: `Reset your ${BRAND} password`,
    html: layout(
      'Password reset requested',
      p(`Use the button below to choose a new password. The link expires in ${esc(d.expiresInMinutes)} minutes. If you did not request this, you can ignore this email.`),
      { label: 'Reset password', url: link(`/reset-password?token=${encodeURIComponent(String(d.token))}`) },
    ),
    text: `Reset your password: ${link(`/reset-password?token=${encodeURIComponent(String(d.token))}`)}`,
  }),

  booking_confirmed: (d: Payload): Rendered => ({
    subject: `Booked: ${d.serviceName} — ${d.when}`,
    html: layout(
      'Your session is booked',
      p(`<strong>${esc(d.serviceName)}</strong> with ${esc(d.otherPartyName)}`) +
        p(`🗓 ${esc(d.when)}`) +
        p('All sessions are online. The Google Meet link will appear in your Session Feed shortly before the start time.'),
      { label: 'Open Session Feed', url: link('/sessions') },
    ),
    text: `Booked: ${d.serviceName} with ${d.otherPartyName} on ${d.when}. Join link will appear in your Session Feed: ${link('/sessions')}`,
  }),

  booking_cancelled: (d: Payload): Rendered => ({
    subject: `Cancelled: ${d.serviceName} — ${d.when}`,
    html: layout(
      'A session was cancelled',
      p(`<strong>${esc(d.serviceName)}</strong> with ${esc(d.otherPartyName)} on ${esc(d.when)} was cancelled by ${esc(d.cancelledByName)}.`) +
        (d.reason ? p(`Reason: ${esc(d.reason)}`) : ''),
      { label: 'Book another time', url: link('/book') },
    ),
    text: `Cancelled: ${d.serviceName} with ${d.otherPartyName} on ${d.when}.${d.reason ? ` Reason: ${d.reason}` : ''}`,
  }),

  session_reminder: (d: Payload): Rendered => ({
    subject: `Reminder: ${d.serviceName} ${d.leadLabel}`,
    html: layout(
      `Your session starts ${d.leadLabel}`,
      p(`<strong>${esc(d.serviceName)}</strong> with ${esc(d.otherPartyName)}`) + p(`🗓 ${esc(d.when)}`),
      { label: 'Open Session Feed', url: link('/sessions') },
    ),
    text: `Reminder: ${d.serviceName} with ${d.otherPartyName} ${d.leadLabel} (${d.when}). ${link('/sessions')}`,
  }),

  meeting_link_posted: (d: Payload): Rendered => ({
    subject: `Join link ready: ${d.serviceName}`,
    html: layout(
      'Your Google Meet link is ready',
      p(`${esc(d.tutorName)} posted the link for <strong>${esc(d.serviceName)}</strong> at ${esc(d.when)}.`),
      { label: 'Join Google Meet', url: String(d.meetingUrl) },
    ),
    text: `Join ${d.serviceName} (${d.when}): ${d.meetingUrl}`,
  }),

  tutor_link_nudge: (d: Payload): Rendered => ({
    subject: `Action needed: post the Meet link for ${d.studentName}`,
    html: layout(
      'Your session starts soon',
      p(`<strong>${esc(d.serviceName)}</strong> with ${esc(d.studentName)} starts at ${esc(d.when)}, and no Google Meet link has been posted yet.`),
      { label: 'Post the link', url: link('/sessions') },
    ),
    text: `Post the Meet link for ${d.serviceName} with ${d.studentName} (${d.when}): ${link('/sessions')}`,
  }),
} satisfies Record<string, (d: Payload) => Rendered>;

export type TemplateKey = keyof typeof templates;

export function render(template: string, payload: Payload): Rendered {
  const fn = (templates as Record<string, (d: Payload) => Rendered>)[template];
  if (!fn) throw new Error(`Unknown email template "${template}"`);
  return fn(payload);
}
