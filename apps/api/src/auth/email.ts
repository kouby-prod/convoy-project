import nodemailer from 'nodemailer';
import { env } from '../env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Pluggable email sender.
 *
 * Two implementations, selected by env at boot:
 *   - `smtpEmailSender`    — real email via SMTP (used when SMTP_HOST is set).
 *   - `consoleEmailSender` — logs the email + link to the console (dev default,
 *                            so verification/reset flows are testable with no
 *                            provider).
 */
export type EmailSender = (message: EmailMessage) => Promise<void>;

export const consoleEmailSender: EmailSender = async (message) => {
  console.log(
    [
      '',
      '📧 ─── DEV EMAIL (console stub) ─────────────────────────────',
      `   from:    ${env.EMAIL_FROM}`,
      `   to:      ${message.to}`,
      `   subject: ${message.subject}`,
      `   body:    ${message.text}`,
      '─────────────────────────────────────────────────────────────',
      '',
    ].join('\n'),
  );
};

// Created once at boot only when SMTP is configured. Works with any SMTP server
// (production relays, or Mailpit/MailHog locally). Auth is optional so
// no-auth dev relays work.
function createSmtpSender(host: string): EmailSender {
  const transporter = nodemailer.createTransport({
    host,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  return async (message) => {
    await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  };
}

export const smtpEmailSender: EmailSender | null = env.SMTP_HOST
  ? createSmtpSender(env.SMTP_HOST)
  : null;

// The active sender: SMTP when configured, otherwise the console stub.
export const sendEmail: EmailSender = smtpEmailSender ?? consoleEmailSender;

console.log(
  `[auth] email sender: ${smtpEmailSender ? `SMTP (${env.SMTP_HOST}:${env.SMTP_PORT})` : 'console stub (set SMTP_HOST to send real email)'}`,
);
