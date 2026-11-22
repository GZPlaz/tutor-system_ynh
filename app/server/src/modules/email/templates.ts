/**
 * Email templates. Each template is a pure function: (payload, brand) → subject/html/text.
 * Payloads are stored as JSON in the outbox; the brand (site name, colour,
 * logo from the admin's Branding page) is applied when the email is sent.
 *
 * To add an email: add a key + renderer below, then call
 *   enqueueEmail(to, 'your_key', { ...payload })
 * Interpolated values are HTML-escaped with esc(); `layout()` escapes titles itself.
 */
import { env } from '../../config/env.js';

export interface EmailBrand {
  siteName: string;
  color: string;
  logoUrl: string | null;
}

export const DEFAULT_EMAIL_BRAND: EmailBrand = { siteName: 'MindAccel Tutoring', color: '#0E6E6A', logoUrl: null };

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const link = (path: string) => `${env.APP_URL}${path}`;

/**
 * People who booked without an account have no "Sessions" page; their emails carry a
 * private link (payload.manageUrl) to a page for that one booking instead.
 */
const sessionsCta = (d: { manageUrl?: unknown }) =>
  d.manageUrl ? { label: 'Manage this booking', url: String(d.manageUrl) } : { label: 'See your sessions', url: link('/sessions') };
const sessionsUrl = (d: { manageUrl?: unknown }) => (d.manageUrl ? String(d.manageUrl) : link('/sessions'));
const p = (html: string) => `<p style="margin:0 0 14px;line-height:1.6;font-size:15px">${html}</p>`;

/** A small "detail card" (session name + time) used by booking emails. */
const detail = (title: unknown, when: unknown, extra?: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;border:1px solid #DCE2DE;border-radius:10px"><tr><td style="padding:14px 16px">
<div style="font-weight:700;font-size:15px">${esc(title)}</div>
<div style="color:#5A6A71;font-size:14px;margin-top:2px">${esc(when)}</div>${extra ?? ''}
</td></tr></table>`;

/** `title` is plain text (escaped here); `body` must already be escaped. */
function layout(brand: EmailBrand, title: string, body: string, cta?: { label: string; url: string }): string {
  const header = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.siteName)}" height="36" style="display:block;height:36px;max-width:220px;border:0">`
    : `<span style="font-weight:800;font-size:17px;color:${esc(brand.color)}">${esc(brand.siteName)}</span>`;
  const button = cta
    ? `<p style="margin:24px 0 8px"><a href="${esc(cta.url)}" style="background:${esc(brand.color)};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">${esc(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F6F7F4;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#15242B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:540px;background:#ffffff;border-radius:14px;padding:30px;border:1px solid #DCE2DE">
<tr><td>
<div style="margin:0 0 24px">${header}</div>
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3">${esc(title)}</h1>
${body}
${button}
<p style="margin:28px 0 0;font-size:12px;color:#5A6A71">You're receiving this because you booked or have an account with ${esc(brand.siteName)}.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

type Payload = Record<string, unknown>;
type Renderer = (d: Payload, b: EmailBrand) => Rendered;

const notesBlock = (notes: unknown) =>
  notes ? `<div style="margin-top:10px;font-size:14px"><span style="color:#5A6A71">Note from the student:</span> ${esc(notes)}</div>` : '';


export const templates = {
  registration_received: (d, b) => ({
    subject: `Thanks for signing up to ${b.siteName}`,
    html: layout(b, `Thanks for signing up, ${d.firstName}!`,
      p('We check every new account by hand to keep the community safe. You will get an email as soon as yours is approved — usually within a day.') +
      p('Once approved you can book your first session straight away.')),
    text: `Thanks for signing up, ${d.firstName}! We'll email you as soon as your account is approved (usually within a day).`,
  }),

  admin_new_registration: (d, b) => ({
    subject: `New sign-up waiting for approval: ${d.studentName}`,
    html: layout(b, 'Someone new wants to join',
      p(`<strong>${esc(d.studentName)}</strong> (${esc(d.studentEmail)}) signed up and is waiting for approval.`),
      { label: 'Review sign-ups', url: link('/admin/people?tab=pending') }),
    text: `${d.studentName} (${d.studentEmail}) signed up and is waiting for approval: ${link('/admin/people?tab=pending')}`,
  }),

  admin_new_account: (d, b) => ({
    subject: `New account: ${d.studentName}`,
    html: layout(b, 'Someone new joined',
      p(`<strong>${esc(d.studentName)}</strong> (${esc(d.studentEmail)}) created an account. Accounts are currently active straight away, so there is nothing for you to approve.`),
      { label: 'See everyone', url: link('/admin/people') }),
    text: `${d.studentName} (${d.studentEmail}) created an account (no approval needed): ${link('/admin/people')}`,
  }),

  account_ready: (d, b) => ({
    subject: `Welcome to ${b.siteName}`,
    html: layout(b, `Welcome, ${d.firstName}!`,
      p('Your account is ready. Sign in to book your first session and find the materials your tutor shares with you.'),
      { label: 'Sign in', url: link('/login') }),
    text: `Welcome, ${d.firstName}! Your account is ready. Sign in: ${link('/login')}`,
  }),

  account_approved: (d, b) => ({
    subject: `You're in — welcome to ${b.siteName}`,
    html: layout(b, `Welcome, ${d.firstName}!`,
      p('Your account is approved. Sign in to book your first session and find the materials your tutor shares with you.'),
      { label: 'Sign in', url: link('/login') }),
    text: `Welcome, ${d.firstName}! Your account is approved. Sign in: ${link('/login')}`,
  }),

  account_rejected: (d, b) => ({
    subject: `About your ${b.siteName} sign-up`,
    html: layout(b, `Hi ${d.firstName},`,
      p('We were not able to approve your account this time.') +
      (d.reason ? p(`Reason: ${esc(d.reason)}`) : '') +
      p('If you think this is a mistake, just reply to this email.')),
    text: `Hi ${d.firstName}, we couldn't approve your account this time.${d.reason ? ` Reason: ${d.reason}` : ''}`,
  }),

  invite: (d, b) => ({
    subject: `You've been invited to ${b.siteName}`,
    html: layout(b, `Hi ${d.firstName}, your account is ready`,
      p(`An administrator created a <strong>${esc(d.roleName)}</strong> account for you. Choose a password to get started — this link works for ${esc(d.expiresInHours)} hours.`),
      { label: 'Choose a password', url: link(`/reset-password?token=${encodeURIComponent(String(d.token))}`) }),
    text: `Choose your password: ${link(`/reset-password?token=${encodeURIComponent(String(d.token))}`)}`,
  }),

  password_reset: (d, b) => ({
    subject: `Reset your ${b.siteName} password`,
    html: layout(b, 'Reset your password',
      p(`Use the button below to choose a new password. The link works for ${esc(d.expiresInMinutes)} minutes. If you didn't ask for this, you can ignore this email.`),
      { label: 'Choose a new password', url: link(`/reset-password?token=${encodeURIComponent(String(d.token))}`) }),
    text: `Choose a new password: ${link(`/reset-password?token=${encodeURIComponent(String(d.token))}`)}`,
  }),

  booking_requested: (d, b) => ({
    subject: `Request sent: ${d.serviceName}, ${d.when}`,
    html: layout(b, 'Your request is with your tutor',
      detail(d.serviceName, d.when, `<div style="font-size:14px;margin-top:6px">with ${esc(d.otherPartyName)}</div>`) +
      p("We'll email you as soon as they confirm. The time is held for you in the meantime."),
      sessionsCta(d)),
    text: `Request sent: ${d.serviceName} with ${d.otherPartyName}, ${d.when}. We'll email you when it's confirmed.${d.manageUrl ? ` Manage or cancel: ${d.manageUrl}` : ''}`,
  }),

  booking_request: (d, b) => ({
    subject: `New request: ${d.studentName}, ${d.when}`,
    html: layout(b, 'You have a new session request',
      detail(d.serviceName, d.when, `<div style="font-size:14px;margin-top:6px">with ${esc(d.studentName)}</div>${notesBlock(d.notes)}`) +
      p('Please confirm or decline it. If nobody responds before the start time, the request is declined automatically.'),
      { label: 'Review the request', url: link('/sessions') }),
    text: `New request from ${d.studentName}: ${d.serviceName}, ${d.when}. Confirm or decline: ${link('/sessions')}`,
  }),

  booking_confirmed: (d, b) => ({
    subject: `Confirmed: ${d.serviceName}, ${d.when}`,
    html: layout(b, "You're booked",
      detail(d.serviceName, d.when, `<div style="font-size:14px;margin-top:6px">with ${esc(d.otherPartyName)}</div>`) +
      p(d.manageUrl
        ? 'Sessions happen online. We will email you the Google Meet link, and it will also appear on your booking page.'
        : 'Sessions happen online. The Google Meet link will appear on your Sessions page, and we will email it to you too.'),
      sessionsCta(d)),
    text: `Confirmed: ${d.serviceName} with ${d.otherPartyName}, ${d.when}. ${sessionsUrl(d)}`,
  }),

  booking_declined: (d, b) => ({
    subject: `Not available: ${d.serviceName}, ${d.when}`,
    html: layout(b, "That time didn't work out",
      detail(d.serviceName, d.when, `<div style="font-size:14px;margin-top:6px">with ${esc(d.otherPartyName)}</div>`) +
      (d.reason ? p(`Reason: ${esc(d.reason)}`) : '') +
      p('The time has been released. Pick another one that suits you.'),
      { label: 'Book another time', url: link('/book') }),
    text: `Your request for ${d.serviceName} on ${d.when} wasn't confirmed.${d.reason ? ` Reason: ${d.reason}` : ''} Book another time: ${link('/book')}`,
  }),

  booking_cancelled: (d, b) => ({
    subject: `Cancelled: ${d.serviceName}, ${d.when}`,
    html: layout(b, 'A session was cancelled',
      detail(d.serviceName, d.when, `<div style="font-size:14px;margin-top:6px">with ${esc(d.otherPartyName)}, cancelled by ${esc(d.cancelledByName)}</div>`) +
      (d.reason ? p(`Reason: ${esc(d.reason)}`) : ''),
      { label: 'Book another time', url: link('/book') }),
    text: `Cancelled: ${d.serviceName} with ${d.otherPartyName}, ${d.when}.${d.reason ? ` Reason: ${d.reason}` : ''}`,
  }),

  session_reminder: (d, b) => ({
    subject: `Reminder: ${d.serviceName} ${d.leadLabel}`,
    html: layout(b, `Your session starts ${d.leadLabel}`,
      detail(d.serviceName, d.when, `<div style="font-size:14px;margin-top:6px">with ${esc(d.otherPartyName)}</div>`),
      d.manageUrl ? { label: 'Open your booking', url: String(d.manageUrl) } : { label: 'Open Sessions', url: link('/sessions') }),
    text: `Reminder: ${d.serviceName} with ${d.otherPartyName} ${d.leadLabel} (${d.when}). ${sessionsUrl(d)}`,
  }),

  message_received: (d, b) => ({
    subject: `New message from ${d.fromName}`,
    html: layout(b, `${d.fromName} sent you a message`,
      `<blockquote style="margin:6px 0 18px;padding:12px 16px;border-left:3px solid #C3CCC7;background:#F6F7F4;color:#15242B;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(d.preview)}</blockquote>` +
      p('Reply on the site. We only email you once until you have read your new messages.'),
      { label: 'Read and reply', url: link(`/messages?c=${encodeURIComponent(String(d.conversationId))}`) }),
    text: `${d.fromName} sent you a message:\n\n${d.preview}\n\nRead and reply: ${link(`/messages?c=${encodeURIComponent(String(d.conversationId))}`)}`,
  }),

  session_question: (d, b) => ({
    subject: `${d.tutorName} has a question before your session`,
    html: layout(b, 'Your tutor has a question',
      detail(d.serviceName, d.when, `<div style="font-size:14px;margin-top:6px">with ${esc(d.tutorName)}</div>`) +
      `<blockquote style="margin:0 0 18px;padding:12px 16px;border-left:3px solid #C3CCC7;background:#F6F7F4;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(d.question)}</blockquote>` +
      p('Answering before the session helps your tutor prepare.'),
      { label: 'Answer the question', url: link(`/messages?c=${encodeURIComponent(String(d.conversationId))}`) }),
    text: `${d.tutorName} has a question before your ${d.serviceName} session (${d.when}):\n\n${d.question}\n\nAnswer it: ${link(`/messages?c=${encodeURIComponent(String(d.conversationId))}`)}`,
  }),

  session_recap: (d, b) => ({
    subject: `Recap of your ${d.serviceName} session`,
    html: layout(b, `${d.tutorName} wrote a recap of your session`,
      detail(d.serviceName, d.when) +
      `<div style="margin:0 0 18px;padding:12px 16px;border-left:3px solid #C3CCC7;background:#F6F7F4;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(d.recap)}</div>` +
      p('You can find it on the session any time, and rate how the session went.'),
      { label: d.manageUrl ? 'Open your booking' : 'See the session', url: d.manageUrl ? String(d.manageUrl) : link('/sessions?view=past') }),
    text: `${d.tutorName} wrote a recap of your ${d.serviceName} session (${d.when}):\n\n${d.recap}\n\n${d.manageUrl ? String(d.manageUrl) : link('/sessions?view=past')}`,
  }),

  admin_new_report: (d, b) => ({
    subject: `New report about ${d.tutorName}`,
    html: layout(b, 'A tutor has been reported',
      p(`<strong>${esc(d.reporterName)}</strong> reported <strong>${esc(d.tutorName)}</strong> (${esc(d.category)}).`) +
      `<blockquote style="margin:6px 0 18px;padding:12px 16px;border-left:3px solid #C3CCC7;background:#F6F7F4;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(d.preview)}</blockquote>`,
      { label: 'Review the report', url: link('/admin/reports') }),
    text: `${d.reporterName} reported ${d.tutorName} (${d.category}):\n\n${d.preview}\n\nReview: ${link('/admin/reports')}`,
  }),

  meeting_link_posted: (d, b) => ({
    subject: `Your Meet link for ${d.serviceName}`,
    html: layout(b, 'Your Google Meet link is ready',
      detail(d.serviceName, d.when, `<div style="font-size:14px;margin-top:6px">with ${esc(d.tutorName)}</div>`) +
      p(d.manageUrl ? 'Use the button at session time. The link is also on your booking page.' : 'Use the button at session time. The link is also on your Sessions page.'),
      { label: 'Join Google Meet', url: String(d.meetingUrl) }),
    text: `Meet link for ${d.serviceName} (${d.when}): ${d.meetingUrl}`,
  }),

  session_started: (d, b) => ({
    subject: `${d.tutorName} has started your session`,
    html: layout(b, 'Your session has started',
      p(`${esc(d.tutorName)} just opened <strong>${esc(d.serviceName)}</strong>. Join whenever you're ready.`),
      d.meetingUrl ? { label: 'Join Google Meet', url: String(d.meetingUrl) } : { label: 'Open Sessions', url: sessionsUrl(d) }),
    text: `${d.tutorName} started ${d.serviceName}. Join: ${d.meetingUrl ?? sessionsUrl(d)}`,
  }),

  tutor_link_nudge: (d, b) => ({
    subject: `Add the Meet link for ${d.studentName}`,
    html: layout(b, 'Your session starts soon',
      detail(d.serviceName, d.when, `<div style="font-size:14px;margin-top:6px">with ${esc(d.studentName)}</div>`) +
      p("There's no Google Meet link on this session yet."),
      { label: 'Add the link', url: link('/sessions') }),
    text: `Add the Meet link for ${d.serviceName} with ${d.studentName} (${d.when}): ${link('/sessions')}`,
  }),
} satisfies Record<string, Renderer>;

export type TemplateKey = keyof typeof templates;

export function render(template: string, payload: Payload, brand: EmailBrand = DEFAULT_EMAIL_BRAND): Rendered {
  const fn = (templates as Record<string, Renderer>)[template];
  if (!fn) throw new Error(`Unknown email template "${template}"`);
  return fn(payload, brand);
}
