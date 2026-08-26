import webpush from 'web-push';
import { env } from '../../env';

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  link: string | null;
}

export interface PushSendResult {
  /** Endpoints the push service reported gone (404/410) — the caller deletes these rows. */
  staleEndpoints: string[];
}

/**
 * Pluggable Web Push sender.
 *
 * Two implementations, selected by env at boot:
 *   - `vapidPushSender`    — real push via the `web-push` library (used when
 *                            both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set).
 *   - `consolePushSender`  — logs the payload to the console (dev default),
 *                            same pattern as `sendEmail` / `sendSms`.
 *
 * Sends to every subscription independently (`Promise.allSettled`): one dead
 * browser subscription must never block delivery to the user's other devices.
 */
export type PushSender = (
  subscriptions: WebPushSubscription[],
  payload: PushPayload,
) => Promise<PushSendResult>;

export const consolePushSender: PushSender = async (subscriptions, payload) => {
  console.log(
    [
      '',
      '🔔 ─── DEV PUSH (console stub) ─────────────────────────────',
      `   subscriptions: ${subscriptions.length}`,
      `   title:         ${payload.title}`,
      `   body:          ${payload.body}`,
      `   link:          ${payload.link ?? '(none)'}`,
      '─────────────────────────────────────────────────────────────',
      '',
    ].join('\n'),
  );
  return { staleEndpoints: [] };
};

export function createVapidSender(publicKey: string, privateKey: string): PushSender {
  webpush.setVapidDetails(env.VAPID_SUBJECT, publicKey, privateKey);

  return async (subscriptions, payload) => {
    const body = JSON.stringify(payload);
    const staleEndpoints: string[] = [];

    // `allSettled`, not `all`: a rejection swallowed inside the mapped callback
    // below never surfaces here anyway, but `allSettled` also makes that
    // intent explicit — one dead subscription must never stop the others from
    // being attempted.
    await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(subscription, body);
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleEndpoints.push(subscription.endpoint);
            return;
          }
          // Anything else (network blip, 5xx from the push service) is logged
          // and dropped, same as every other notification channel — there's
          // no retry queue in this codebase.
          console.error(`Failed to push to ${subscription.endpoint}`, err);
        }
      }),
    );

    return { staleEndpoints };
  };
}

export const vapidPushSender: PushSender | null =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? createVapidSender(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
    : null;

// The active sender: real Web Push when a VAPID key pair is configured, otherwise the console stub.
export const sendWebPush: PushSender = vapidPushSender ?? consolePushSender;

/** `null` tells the client push isn't configured server-side — the settings UI hides the toggle. */
export const vapidPublicKey: string | null = env.VAPID_PUBLIC_KEY ?? null;

console.log(
  `[notification] push sender: ${vapidPushSender ? 'Web Push (VAPID configured)' : 'console stub (set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY to send real push)'}`,
);
