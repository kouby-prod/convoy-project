import type { NotificationPreference } from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';
import { ApiError } from './api-error';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/** GET /notifications/preferences — defaults to both channels on when no row exists. */
export async function fetchNotificationPreferences(): Promise<NotificationPreference> {
  const res = await api.notifications.preferences.$get();
  if (!res.ok) throw new ApiError(res.status, 'Failed to load notification preferences');
  return res.json();
}

/** PUT /notifications/preferences — upsert the caller's email / in-app switches. */
export async function saveNotificationPreferences(
  prefs: NotificationPreference,
): Promise<NotificationPreference> {
  const res = await api.notifications.preferences.$put({ json: prefs });
  if (!res.ok) throw new ApiError(res.status, 'Failed to save notification preferences');
  return res.json();
}
