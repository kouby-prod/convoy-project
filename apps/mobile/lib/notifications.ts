import type {
  MarkAllReadResponse,
  Notification,
  NotificationPage,
  NotificationPreference,
  UnreadCount,
} from '@carpool/schemas';
import { api } from './api-client';

export async function fetchNotifications(page: number, unreadOnly: boolean): Promise<NotificationPage> {
  const res = await api.notifications.$get({
    query: { page: String(page), limit: '20', ...(unreadOnly ? { unreadOnly: 'true' as const } : {}) },
  });
  if (!res.ok) throw new Error('Failed to load notifications');
  return res.json();
}

export async function fetchUnreadNotificationCount(): Promise<UnreadCount> {
  const res = await api.notifications['unread-count'].$get();
  if (!res.ok) throw new Error('Failed to load the unread count');
  return res.json();
}

export async function markNotificationRead(id: string): Promise<Notification> {
  const res = await api.notifications[':id'].read.$patch({ param: { id } });
  if (!res.ok) throw new Error('Failed to mark as read');
  return res.json();
}

export async function markAllNotificationsRead(): Promise<MarkAllReadResponse> {
  const res = await api.notifications['read-all'].$patch();
  if (!res.ok) throw new Error('Failed to mark all as read');
  return res.json();
}

/** GET /notifications/preferences — missing row reads as both channels on. */
export async function fetchNotificationPreferences(): Promise<NotificationPreference> {
  const res = await api.notifications.preferences.$get();
  if (!res.ok) throw new Error('Failed to load notification preferences');
  return res.json();
}

/** PUT /notifications/preferences — upsert the caller's email / in-app switches. */
export async function saveNotificationPreferences(prefs: NotificationPreference): Promise<NotificationPreference> {
  const res = await api.notifications.preferences.$put({ json: prefs });
  if (!res.ok) throw new Error('Failed to save notification preferences');
  return res.json();
}
