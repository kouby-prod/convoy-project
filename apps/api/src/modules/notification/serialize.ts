import type { Notification } from '@carpool/schemas';
import type { notification } from '../../db/notification';

type NotificationRow = typeof notification.$inferSelect;

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
