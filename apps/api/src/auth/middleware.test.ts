import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock BetterAuth's server API so the middleware can be tested in isolation —
// no database, no real sessions. We only control what `getSession` returns.
const getSession = vi.fn();
vi.mock('./auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}));

import { getAuth, requireAuth, requireRole } from './middleware';
import type { AuthEnv } from './context';

/** A small app that exercises both middlewares, mirroring the real proof routes. */
function buildApp() {
  const app = new Hono<AuthEnv>();

  app.use('/me', requireAuth);
  app.get('/me', (c) => {
    const { user } = getAuth(c);
    return c.json({ id: user.id, role: user.role ?? null });
  });

  app.use('/admin', requireAuth, requireRole('admin'));
  app.get('/admin', (c) => c.json({ status: 'ok' }));

  return app;
}

function sessionFor(role: string | null) {
  return {
    user: { id: 'u_1', email: 'x@example.com', name: 'X', emailVerified: true, role },
    session: { id: 's_1', userId: 'u_1', token: 'tok' },
  };
}

describe('requireAuth', () => {
  beforeEach(() => getSession.mockReset());

  it('returns 401 when there is no session', async () => {
    getSession.mockResolvedValue(null);
    const res = await buildApp().request('/me');
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 200 and the user when authenticated', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    const res = await buildApp().request('/me');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: 'u_1', role: 'user' });
  });
});

describe('requireRole("admin")', () => {
  beforeEach(() => getSession.mockReset());

  it('returns 401 when unauthenticated', async () => {
    getSession.mockResolvedValue(null);
    const res = await buildApp().request('/admin');
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user is not an admin', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    const res = await buildApp().request('/admin');
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns 200 when the user is an admin', async () => {
    getSession.mockResolvedValue(sessionFor('admin'));
    const res = await buildApp().request('/admin');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });

  it('supports comma-separated roles (admin among several)', async () => {
    getSession.mockResolvedValue(sessionFor('user,admin'));
    const res = await buildApp().request('/admin');
    expect(res.status).toBe(200);
  });
});
