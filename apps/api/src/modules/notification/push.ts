import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { pushToken } from '../../db/notification';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Expo's push send endpoint takes a batch and always returns 200 with a
 * per-message `status` — including `"error"` entries for individual bad
 * tokens (e.g. `DeviceNotRegistered`) inside an otherwise-successful HTTP
 * response. This project doesn't prune those yet (see docs/mobile-best-practices-2026.md);
 * a stale token just fails silently on every future push until re-registered
 * by the next sign-in.
 */
type ExpoPushTicket = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

/**
 * Sends one push notification to every device `userId` has registered.
 * No-ops (no network call) when the user has no registered device — the
 * common case for anyone who hasn't installed the mobile app. Never throws:
 * a dead push service must never fail the action that triggered the
 * notification, same contract as `notifyUser`'s email/WS branches.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const tokens = await db.select({ token: pushToken.token }).from(pushToken).where(eq(pushToken.userId, userId));
  if (tokens.length === 0) return;

  const messages = tokens.map(({ token }) => ({
    to: token,
    title,
    body,
    ...(data ? { data } : {}),
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    throw new Error(`Expo push API returned ${res.status}`);
  }

  const payload = (await res.json()) as { data?: ExpoPushTicket[] };
  const errors = (payload.data ?? []).filter((ticket) => ticket.status === 'error');
  if (errors.length > 0) {
    console.error(`[push] ${errors.length}/${messages.length} ticket(s) failed for user ${userId}`, errors);
  }
}
