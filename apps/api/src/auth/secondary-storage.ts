import type Redis from 'ioredis';

const KEY_PREFIX = 'better-auth:';

function prefixed(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

/**
 * BetterAuth secondary storage on the shared Redis (rate limits + session
 * cache). Prefixed so it never collides with BullMQ / pub-sub keys.
 *
 * `getAndDelete` and `increment` are optional on the BetterAuth type but we
 * implement both: consume paths stay atomic, and rate-limit counters share a
 * window across API replicas.
 */
export function createAuthSecondaryStorage(redis: Redis) {
  return {
    async get(key: string): Promise<string | null> {
      return redis.get(prefixed(key));
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      const namespaced = prefixed(key);
      if (ttl && ttl > 0) {
        await redis.set(namespaced, value, 'EX', ttl);
        return;
      }
      await redis.set(namespaced, value);
    },

    async delete(key: string): Promise<void> {
      await redis.del(prefixed(key));
    },

    async getAndDelete(key: string): Promise<string | null> {
      return redis.getdel(prefixed(key));
    },

    async increment(key: string, ttl: number): Promise<number> {
      const namespaced = prefixed(key);
      const next = await redis.incr(namespaced);
      if (next === 1 && ttl > 0) {
        await redis.expire(namespaced, ttl);
      }
      return next;
    },
  };
}
