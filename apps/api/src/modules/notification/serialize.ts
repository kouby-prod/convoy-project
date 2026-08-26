import type { Notification, NotificationPreference } from '@carpool/schemas';
import type { notification, notificationPreference } from '../../db/notification';

type NotificationRow = typeof notification.$inferSelect;
type NotificationPreferenceRow = typeof notificationPreference.$inferSelect;

/** DB row → wire shape: dates as ISO strings, matching `NotificationSchema`. */
export function serializeNotification(row: NotificationRow): Notification {
  return {
    ...row,
    type: row.type as Notification['type'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

export function serializeNotificationPreference(
  row: NotificationPreferenceRow,
): NotificationPreference {
  return {
    emailEnabled: row.emailEnabled,
    inAppEnabled: row.inAppEnabled,
  };
}
