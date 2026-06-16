import { env } from '../env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Pluggable email sender.
 *
 * In dev this logs the email (and any verification/reset link) to the console
 * so flows are testable without a real provider.
 *
 * TODO: swap this implementation for a real provider (Resend / SES / SMTP).
 *       Keep the same `EmailSender` signature so nothing else changes.
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

// The active sender. Point this at a real provider in production.
export const sendEmail: EmailSender = consoleEmailSender;
