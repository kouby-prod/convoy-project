import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { rateLimit } from '../../src/middleware/rate-limit';

function appWithLimiter(...args: Parameters<typeof rateLimit>) {
  const app = new Hono();
  app.use('/', rateLimit(...args));
  app.get('/', (c) => c.text('ok'));
  return app;
}

describe('rateLimit', () => {
  afterEach(() => vi.useRealTimers());

  it('allows requests under the limit', async () => {
    const app = appWithLimiter({ windowSeconds: 60, max: 3 });
    const headers = { 'x-forwarded-for': '1.2.3.4' };

    for (let i = 0; i < 3; i++) {
      const res = await app.request('/', { headers });
      expect(res.status).toBe(200);
    }
  });

  it('blocks once the limit is exceeded, with a Retry-After header', async () => {
    const app = appWithLimiter({ windowSeconds: 60, max: 2 });
    const headers = { 'x-forwarded-for': '1.2.3.4' };

    await app.request('/', { headers });
    await app.request('/', { headers });
    const res = await app.request('/', { headers });

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/too many requests/i);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('tracks each caller (key) independently', async () => {
    const app = appWithLimiter({ windowSeconds: 60, max: 1 });

    const first = await app.request('/', { headers: { 'x-forwarded-for': '1.1.1.1' } });
    const second = await app.request('/', { headers: { 'x-forwarded-for': '2.2.2.2' } });
    // Same caller as `first`, over its limit of 1.
    const third = await app.request('/', { headers: { 'x-forwarded-for': '1.1.1.1' } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
  });

  it('resets the count once the window elapses', async () => {
    vi.useFakeTimers();
    const app = appWithLimiter({ windowSeconds: 60, max: 1 });
    const headers = { 'x-forwarded-for': '1.2.3.4' };

    const first = await app.request('/', { headers });
    const blocked = await app.request('/', { headers });
    vi.advanceTimersByTime(60_001);
    const afterWindow = await app.request('/', { headers });

    expect(first.status).toBe(200);
    expect(blocked.status).toBe(429);
    expect(afterWindow.status).toBe(200);
  });

  it('uses a custom keyGenerator when given one', async () => {
    const app = new Hono();
    app.use(
      '/',
      rateLimit({
        windowSeconds: 60,
        max: 1,
        keyGenerator: (c) => c.req.header('x-user-id') ?? 'anonymous',
      }),
    );
    app.get('/', (c) => c.text('ok'));

    const alice1 = await app.request('/', { headers: { 'x-user-id': 'alice' } });
    const bob1 = await app.request('/', { headers: { 'x-user-id': 'bob' } });
    const alice2 = await app.request('/', { headers: { 'x-user-id': 'alice' } });

    expect(alice1.status).toBe(200);
    expect(bob1.status).toBe(200);
    expect(alice2.status).toBe(429);
  });

  it('does not crash when there is no x-forwarded-for header', async () => {
    const app = appWithLimiter({ windowSeconds: 60, max: 5 });
    const res = await app.request('/');
    expect(res.status).toBe(200);
  });
});
