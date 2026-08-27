import nodemailer from 'nodemailer';
import { env } from '../env';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
}

/**
 * Pluggable email sender.
 *
 * Two implementations, selected at send time (not module load):
 *   - SMTP when `SMTP_HOST` is set
 *   - console stub otherwise (prints the message, including verification links,
 *     so local flows work with no provider)
 */
export type EmailSender = (message: EmailMessage) => Promise<void>;

/** Nodemailer `secure`: TLS-on-connect. Unset flag follows port 465. */
export function smtpSecure(port: number, flag: boolean | undefined): boolean {
  return flag ?? port === 465;
}

export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST?.trim());
}

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

/**
 * Invoice PDF attach check. Null when mail is the console stub.
 * Evaluated at access time so it sees runtime env, not a boot snapshot.
 */
export function getSmtpEmailSender(): EmailSender | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;

  return async (message) => {
    const port = env.SMTP_PORT;
    const secure = smtpSecure(port, env.SMTP_SECURE);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      attachments: message.attachments?.map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType,
      })),
    });
  };
}

export const sendEmail: EmailSender = async (message) => {
  const smtp = getSmtpEmailSender();
  const via = smtp
    ? `smtp ${env.SMTP_HOST}:${env.SMTP_PORT} secure=${smtpSecure(env.SMTP_PORT, env.SMTP_SECURE)}`
    : 'console';
  try {
    await (smtp ?? consoleEmailSender)(message);
    console.log(`[email] sent ok to ${message.to} via ${via}`);
  } catch (err) {
    console.error(`[email] send failed to ${message.to} via ${via}`, err);
    throw err;
  }
};

console.log(
  `[auth] email sender: ${
    isSmtpConfigured()
      ? `SMTP (${env.SMTP_HOST}:${env.SMTP_PORT} secure=${smtpSecure(env.SMTP_PORT, env.SMTP_SECURE)})`
      : 'console stub (set SMTP_HOST to send real email)'
  }`,
);
