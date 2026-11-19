/**
 * Google SMTP transport (Gmail or Google Workspace).
 *
 * Setup (once):
 *   1. Turn on 2-Step Verification for the sending Google account.
 *   2. Create an App Password (Google Account → Security → App passwords).
 *   3. Put the account in SMTP_USER and the 16-char app password in SMTP_PASS.
 *
 * Port 465 + secure=true (implicit TLS) is the most reliable choice. Port 587
 * with SMTP_SECURE=false also works (STARTTLS is upgraded automatically).
 *
 * Gmail caps sending (roughly 500 recipients/day on consumer accounts, more on
 * Workspace). The outbox worker spreads retries, but if you outgrow the cap
 * switch SMTP_HOST to Workspace's smtp-relay.gmail.com or a transactional
 * provider — nothing else in the codebase changes.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    pool: true, // reuse connections across a batch
    maxConnections: 2,
    maxMessages: 50,
  });
  return transporter;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(mail: OutgoingMail): Promise<void> {
  if (!env.EMAIL_ENABLED) {
    logger.info({ to: mail.to, subject: mail.subject }, '[EMAIL_ENABLED=false] email not sent');
    logger.debug({ text: mail.text }, 'Email body');
    return;
  }
  await getTransporter().sendMail({ from: env.MAIL_FROM, ...mail });
}

/** Called at boot so bad SMTP credentials show up in the logs immediately. */
export async function verifySmtp(): Promise<void> {
  if (!env.EMAIL_ENABLED) return;
  try {
    await getTransporter().verify();
    logger.info({ host: env.SMTP_HOST, user: env.SMTP_USER }, 'SMTP connection verified');
  } catch (err) {
    logger.error({ err }, 'SMTP verification failed — emails will be retried by the outbox worker');
  }
}
