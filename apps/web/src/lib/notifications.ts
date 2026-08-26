import type { NotificationPreference, SubscribeWebPush } from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';
import { ApiError } from './api-error';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/** GET /notifications/preferences — defaults to every channel on when no row exists. */
export async function fetchNotificationPreferences(): Promise<NotificationPreference> {
  const res = await api.notifications.preferences.$get();
  if (!res.ok) throw new ApiError(res.status, 'Failed to load notification preferences');
  return res.json();
}

/** PUT /notifications/preferences — upsert the caller's email / in-app / push switches. */
export async function saveNotificationPreferences(
  prefs: NotificationPreference,
): Promise<NotificationPreference> {
  const res = await api.notifications.preferences.$put({ json: prefs });
  if (!res.ok) throw new ApiError(res.status, 'Failed to save notification preferences');
  return res.json();
}

/** GET /notifications/push/vapid-public-key — null means push isn't configured server-side. */
export async function fetchVapidPublicKey(): Promise<string | null> {
  const res = await api.notifications.push['vapid-public-key'].$get();
  if (!res.ok) throw new ApiError(res.status, 'Failed to load the push public key');
  const { publicKey } = await res.json();
  return publicKey;
}

/** POST /notifications/push/subscribe — register (or refresh) a browser push subscription. */
export async function subscribeWebPush(subscription: SubscribeWebPush): Promise<void> {
  const res = await api.notifications.push.subscribe.$post({ json: subscription });
  if (!res.ok) throw new ApiError(res.status, 'Failed to subscribe to push notifications');
}

/** POST /notifications/push/unsubscribe — remove a browser push subscription. */
export async function unsubscribeWebPush(endpoint: string): Promise<void> {
  const res = await api.notifications.push.unsubscribe.$post({ json: { endpoint } });
  if (!res.ok) throw new ApiError(res.status, 'Failed to unsubscribe from push notifications');
}
