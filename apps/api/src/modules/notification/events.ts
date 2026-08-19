import type { Notification } from '@carpool/schemas';
import { createRedisConnection } from '../../queue/redis';

/** Redis channel prefix — `NotificationHub` subscribes with `psubscribe(`${prefix}*`)`. */
export const NOTIFICATION_EVENTS_CHANNEL_PREFIX = 'notifications:user:';

export function userNotificationsChannel(userId: string): string {
  return `${NOTIFICATION_EVENTS_CHANNEL_PREFIX}${userId}`;
}

let publisher: ReturnType<typeof createRedisConnection> | undefined;

/**
 * Publish a `notification.created` event for live WebSocket fan-out. Called
 * from `notifyUser` right after the DB insert succeeds — failures here are
 * caught by the caller and must never fail the action that triggered them.
 */
export async function publishNotificationCreated(notification: Notification): Promise<void> {
  if (!publisher) {
    publisher = createRedisConnection('notification-publisher');
  }
  await publisher.publish(
    userNotificationsChannel(notification.userId),
    JSON.stringify({ type: 'notification.created', notification }),
  );
}

/** Test / shutdown helper — closes the lazy publisher connection if it was opened. */
export async function closeNotificationPublisher(): Promise<void> {
  if (publisher) {
    await publisher.quit();
    publisher = undefined;
  }
}
