import type Redis from 'ioredis';
import { WsLocationServerFrameSchema, type WsLocationServerFrame } from '@carpool/schemas';
import { createRedisConnection } from '../queue/redis';
import { LOCATION_EVENTS_CHANNEL_PREFIX } from '../modules/tracking/events';

export type WsSender = {
  send: (data: string) => void;
};

type LocalSocket = {
  userId: string;
  send: (frame: WsLocationServerFrame) => void;
  trajets: Set<string>;
};

type BroadcastFrame = Extract<WsLocationServerFrame, { type: 'location.updated' | 'location.stopped' }>;

/**
 * In-process WebSocket fan-out hub for live locations. Same shape as
 * `MessageHub` (see `hub.ts`): each API instance keeps its own socket map and
 * learns about positions published on other instances via Redis pattern
 * subscribe on `location:trajet:*` (published by the tracking module, see
 * `modules/tracking/events.ts`).
 */
class LocationHub {
  private readonly sockets = new Map<string, LocalSocket>();
  private readonly trajetIndex = new Map<string, Set<string>>();
  private subscriber: Redis | undefined;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    this.subscriber = createRedisConnection('location-hub-sub');
    void this.subscriber.psubscribe(`${LOCATION_EVENTS_CHANNEL_PREFIX}*`);

    this.subscriber.on('pmessage', (_pattern, channel, raw) => {
      const trajetId = channel.slice(LOCATION_EVENTS_CHANNEL_PREFIX.length);
      if (!trajetId) return;

      let frame: BroadcastFrame;
      try {
        const parsed: unknown = JSON.parse(raw);
        const result = WsLocationServerFrameSchema.safeParse(parsed);
        if (
          !result.success ||
          (result.data.type !== 'location.updated' && result.data.type !== 'location.stopped')
        ) {
          return;
        }
        frame = result.data;
      } catch (err) {
        console.error('[location-hub] bad pub/sub payload', err);
        return;
      }

      this.fanOut(trajetId, frame);
    });

    console.log('[location-hub] subscribed to', `${LOCATION_EVENTS_CHANNEL_PREFIX}*`);
  }

  async stop(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = undefined;
    }
    this.sockets.clear();
    this.trajetIndex.clear();
    this.started = false;
  }

  register(socketId: string, userId: string, sender: WsSender): void {
    this.sockets.set(socketId, {
      userId,
      send: (frame) => sender.send(JSON.stringify(frame)),
      trajets: new Set(),
    });
  }

  unregister(socketId: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) return;

    for (const trajetId of socket.trajets) {
      this.removeFromIndex(trajetId, socketId);
    }
    this.sockets.delete(socketId);
  }

  subscribe(socketId: string, trajetId: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) return;

    socket.trajets.add(trajetId);
    let set = this.trajetIndex.get(trajetId);
    if (!set) {
      set = new Set();
      this.trajetIndex.set(trajetId, set);
    }
    set.add(socketId);
  }

  unsubscribe(socketId: string, trajetId: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) return;

    socket.trajets.delete(trajetId);
    this.removeFromIndex(trajetId, socketId);
  }

  private removeFromIndex(trajetId: string, socketId: string): void {
    const set = this.trajetIndex.get(trajetId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) this.trajetIndex.delete(trajetId);
  }

  private fanOut(trajetId: string, frame: BroadcastFrame): void {
    const set = this.trajetIndex.get(trajetId);
    if (!set) return;

    for (const socketId of set) {
      const socket = this.sockets.get(socketId);
      if (!socket) continue;
      try {
        socket.send(frame);
      } catch (err) {
        console.error(`[location-hub] send failed for ${socketId}`, err);
      }
    }
  }
}

export const locationHub = new LocationHub();
