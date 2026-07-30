import { createMiddleware } from 'hono/factory';
import type { Context, Env } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

interface RateLimitOptions<E extends Env> {
  /** Rolling window length, in seconds — mirrors BetterAuth's `window` unit
   * (apps/api/src/auth/auth.ts) so the two are easy to compare. */
  windowSeconds: number;
  /** Max requests per caller per window. */
  max: number;
  /**
   * How to identify a caller. Defaults to their remote IP. Generic over `E`
   * so a caller-specific key (e.g. an authenticated user id) can be typed
   * against that app's own `Context<E>` — see bookRateLimit in
   * apps/api/src/modules/trajet/index.ts for an example with `AuthEnv`.
   */
  keyGenerator?: (c: Context<E>) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

function ipKeyGenerator<E extends Env>(c: Context<E>): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * In-memory, single-process, fixed-window rate limiter for domain routes
 * BetterAuth's own `rateLimit.customRules` can't reach (those only cover its
 * `/api/auth/*` routes — see apps/api/src/auth/auth.ts). Mirrors that same
 * window/max shape so the two stay easy to compare.
 *
 * TODO(prod): back this with the Redis already provisioned in
 * infra/docker-compose.infra.yml (same TODO as BetterAuth's `secondaryStorage`)
 * so limits survive restarts and are shared across instances — right now each
 * server process (and each `rateLimit(...)` call) tracks its own counters.
 */
export function rateLimit<E extends Env = Env>({
  windowSeconds,
  max,
  keyGenerator = ipKeyGenerator,
}: RateLimitOptions<E>) {
  const windowMs = windowSeconds * 1000;
  const buckets = new Map<string, Bucket>();

  // Without this, every distinct caller (IP or user) leaves a bucket behind
  // forever, even after their window has long since reset.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweep.unref?.();

  return createMiddleware<E>(async (c, next) => {
    const key = keyGenerator(c);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (bucket.count >= max) {
      c.header('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return c.json({ error: 'Too many requests' }, 429);
    }

    bucket.count += 1;
    await next();
  });
}
