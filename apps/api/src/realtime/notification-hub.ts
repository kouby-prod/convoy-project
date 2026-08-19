import type Redis from 'ioredis';
import { NotificationSchema, type Notification, type WsNotificationServerFrame } from '@carpool/schemas';
import { createRedisConnection } from '../queue/redis';
import { NOTIFICATION_EVENTS_CHANNEL_PREFIX } from '../modules/notification/events';

export type WsSender = {
  send: (data: string) => void;
};

type LocalSocket = {
  send: (frame: WsNotificationServerFrame) => void;
};

/**
 * In-process WebSocket fan-out hub for notifications. Same shape as
 * `MessageHub` (see `hub.ts`), simplified: sockets are keyed directly by
 * `userId` — there's no per-booking subscribe step, a user's socket(s)
 * receive all of their own notifications. Each API instance learns about
 * notifications created on other instances via Redis pattern subscribe on
 * `notifications:user:*` (published by `notifyUser`, see
 * `modules/notification/events.ts`).
 */
class NotificationHub {
  private readonly sockets = new Map<string, LocalSocket>();
  private readonly userIndex = new Map<string, Set<string>>();
  private subscriber: Redis | undefined;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    this.subscriber = createRedisConnection('notification-hub-sub');
    void this.subscriber.psubscribe(`${NOTIFICATION_EVENTS_CHANNEL_PREFIX}*`);

    this.subscriber.on('pmessage', (_pattern, channel, raw) => {
      const userId = channel.slice(NOTIFICATION_EVENTS_CHANNEL_PREFIX.length);
      if (!userId) return;

      let notification: Notification;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          !('type' in parsed) ||
          (parsed as { type: unknown }).type !== 'notification.created' ||
          !('notification' in parsed)
        ) {
          return;
        }
        notification = NotificationSchema.parse((parsed as { notification: unknown }).notification);
      } catch (err) {
        console.error('[notification-hub] bad pub/sub payload', err);
        return;
      }

      this.fanOut(userId, { type: 'notification.created', notification });
    });

    console.log('[notification-hub] subscribed to', `${NOTIFICATION_EVENTS_CHANNEL_PREFIX}*`);
  }

  async stop(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = undefined;
    }
    this.sockets.clear();
    this.userIndex.clear();
    this.started = false;
  }

  register(socketId: string, userId: string, sender: WsSender): void {
    this.sockets.set(socketId, {
      send: (frame) => sender.send(JSON.stringify(frame)),
    });
    let set = this.userIndex.get(userId);
    if (!set) {
      set = new Set();
      this.userIndex.set(userId, set);
    }
    set.add(socketId);
  }

  unregister(socketId: string, userId: string): void {
    this.sockets.delete(socketId);
    const set = this.userIndex.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) this.userIndex.delete(userId);
  }

  private fanOut(userId: string, frame: WsNotificationServerFrame): void {
    const set = this.userIndex.get(userId);
    if (!set) return;

    for (const socketId of set) {
      const socket = this.sockets.get(socketId);
      if (!socket) continue;
      try {
        socket.send(frame);
      } catch (err) {
        console.error(`[notification-hub] send failed for ${socketId}`, err);
      }
    }
  }
}

export const notificationHub = new NotificationHub();
