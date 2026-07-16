import { env } from '../env';

export interface SmsMessage {
  to: string;
  text: string;
}

/**
 * Pluggable SMS sender.
 *
 * Two implementations, selected by env at boot:
 *   - `gatewaySmsSender`  — real SMS via a self-hosted SMSGate "Local mode"
 *                           Android phone (used when SMS_GATEWAY_URL is set).
 *   - `consoleSmsSender`  — logs the OTP to the console (dev default). Look for
 *                           "DEV SMS" in the API logs to find the code.
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

/**
 * Build a sender that POSTs to a self-hosted SMSGate "Local mode" phone.
 * See https://docs.sms-gate.app — `POST {baseUrl}/message` with Basic auth and
 * body `{ textMessage: { text }, phoneNumbers: [to] }`. Uses Node's global
 * `fetch` (no extra dependency).
 */
export function createGatewaySender(opts: {
  baseUrl: string;
  user?: string;
  password?: string;
}): SmsSender {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/message`;
  const authHeader =
    opts.user !== undefined
      ? `Basic ${Buffer.from(`${opts.user}:${opts.password ?? ''}`).toString('base64')}`
      : undefined;

  return async (message) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        textMessage: { text: message.text },
        phoneNumbers: [message.to],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`SMS gateway responded ${res.status}: ${body.slice(0, 200)}`);
    }
  };
}

export const gatewaySmsSender: SmsSender | null = env.SMS_GATEWAY_URL
  ? createGatewaySender({
      baseUrl: env.SMS_GATEWAY_URL,
      user: env.SMS_GATEWAY_USER,
      password: env.SMS_GATEWAY_PASSWORD,
    })
  : null;

// The active sender: self-hosted gateway when configured, otherwise console.
export const sendSms: SmsSender = gatewaySmsSender ?? consoleSmsSender;

console.log(
  `[auth] sms sender: ${gatewaySmsSender ? `gateway (${env.SMS_GATEWAY_URL})` : 'console stub (set SMS_GATEWAY_URL to send real SMS)'}`,
);
