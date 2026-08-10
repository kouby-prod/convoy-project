import Redis from 'ioredis';
import { env } from '../env';

/**
 * Shared Redis connection factory for BullMQ and the realtime pub/sub hub.
 * BullMQ requires `maxRetriesPerRequest: null` on its connections; pub/sub
 * needs a dedicated subscriber connection (Redis forbids other commands on
 * a connection that has issued SUBSCRIBE).
 */
export function createRedisConnection(label: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on('error', (err: unknown) => {
    console.error(`[redis:${label}]`, err);
  });

  return client;
}
