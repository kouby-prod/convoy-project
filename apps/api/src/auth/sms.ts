import { env } from '../env';

export interface SmsMessage {
  to: string;
  text: string;
}

/**
 * Pluggable SMS sender.
 *
 * In dev this logs the OTP to the console so the phone-number flow is testable
 * without a real SMS provider. Look for "DEV SMS" in the API logs to find the
 * code.
 *
 * TODO: swap this implementation for Twilio (use TWILIO_ACCOUNT_SID /
 *       TWILIO_AUTH_TOKEN / SMS_FROM). Keep the same `SmsSender` signature.
 */
export type SmsSender = (message: SmsMessage) => Promise<void>;

export const consoleSmsSender: SmsSender = async (message) => {
  console.log(
    [
      '',
      '📱 ─── DEV SMS (console stub) ──────────────────────────────',
      `   from: ${env.SMS_FROM}`,
      `   to:   ${message.to}`,
      `   text: ${message.text}`,
      '─────────────────────────────────────────────────────────────',
      '',
    ].join('\n'),
  );
};

// The active sender. Point this at Twilio in production.
export const sendSms: SmsSender = consoleSmsSender;
