import type Redis from 'ioredis';
import { MessageSchema, type Message, type WsServerFrame } from '@carpool/schemas';
import { createRedisConnection } from '../queue/redis';
import { MESSAGE_EVENTS_CHANNEL_PREFIX } from '../queue/message-jobs';

export type WsSender = {
  send: (data: string) => void;
};

type LocalSocket = {
  userId: string;
  send: (frame: WsServerFrame) => void;
  bookings: Set<string>;
};

/**
 * In-process WebSocket fan-out hub. Each API instance keeps its own socket
 * map and learns about messages created on other instances via Redis
 * pattern subscribe on `messages:booking:*` (published by the BullMQ worker).
 */
class MessageHub {
  private readonly sockets = new Map<string, LocalSocket>();
  private readonly bookingIndex = new Map<string, Set<string>>();
  private subscriber: Redis | undefined;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    this.subscriber = createRedisConnection('message-hub-sub');
    void this.subscriber.psubscribe(`${MESSAGE_EVENTS_CHANNEL_PREFIX}*`);

    this.subscriber.on('pmessage', (_pattern, channel, raw) => {
      const bookingId = channel.slice(MESSAGE_EVENTS_CHANNEL_PREFIX.length);
      if (!bookingId) return;

      let message: Message;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          !('type' in parsed) ||
          (parsed as { type: unknown }).type !== 'message.created' ||
          !('message' in parsed)
        ) {
          return;
        }
        message = MessageSchema.parse((parsed as { message: unknown }).message);
      } catch (err) {
        console.error('[message-hub] bad pub/sub payload', err);
        return;
      }

      this.fanOut(bookingId, { type: 'message.created', message });
    });

    console.log('[message-hub] subscribed to', `${MESSAGE_EVENTS_CHANNEL_PREFIX}*`);
  }

  async stop(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = undefined;
    }
    this.sockets.clear();
    this.bookingIndex.clear();
    this.started = false;
  }

  register(socketId: string, userId: string, sender: WsSender): void {
    this.sockets.set(socketId, {
      userId,
      send: (frame) => sender.send(JSON.stringify(frame)),
      bookings: new Set(),
    });
  }

  unregister(socketId: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) return;

    for (const bookingId of socket.bookings) {
      this.removeFromBookingIndex(bookingId, socketId);
    }
    this.sockets.delete(socketId);
  }

  subscribe(socketId: string, bookingId: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) return;

    socket.bookings.add(bookingId);
    let set = this.bookingIndex.get(bookingId);
    if (!set) {
      set = new Set();
      this.bookingIndex.set(bookingId, set);
    }
    set.add(socketId);
  }

  unsubscribe(socketId: string, bookingId: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) return;

    socket.bookings.delete(bookingId);
    this.removeFromBookingIndex(bookingId, socketId);
  }

  private removeFromBookingIndex(bookingId: string, socketId: string): void {
    const set = this.bookingIndex.get(bookingId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) this.bookingIndex.delete(bookingId);
  }

  private fanOut(bookingId: string, frame: WsServerFrame): void {
    const set = this.bookingIndex.get(bookingId);
    if (!set) return;

    for (const socketId of set) {
      const socket = this.sockets.get(socketId);
      if (!socket) continue;
      try {
        socket.send(frame);
      } catch (err) {
        console.error(`[message-hub] send failed for ${socketId}`, err);
      }
    }
  }
}

export const messageHub = new MessageHub();
