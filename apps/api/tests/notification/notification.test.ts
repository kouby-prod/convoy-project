import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hermetic: fake the Drizzle query builder so no real database is needed.
 * Mirrors the harness in apps/api/tests/message/message.test.ts.
 */
function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    values: () => chain,
    set: () => chain,
    onConflictDoUpdate: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    returning: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const dbState = vi.hoisted(() => ({
  selectResult: [] as unknown[],
  // Queue for tests where the handler issues more than one `select` (e.g. the
  // list route also queries the unread count) — each call shifts one entry.
  selectQueue: [] as unknown[][],
  insertResult: [] as unknown[],
  updateResult: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  select: vi.fn(() =>
    createChain(dbState.selectQueue.length ? dbState.selectQueue.shift() : dbState.selectResult),
  ),
  insert: vi.fn(() => createChain(dbState.insertResult)),
  update: vi.fn(() => createChain(dbState.updateResult)),
  delete: vi.fn(() => createChain(undefined)),
}));

vi.mock('../../src/db/client', () => ({ db }));

// The real push module talks to `web-push` and reads VAPID env vars at
// import time — mocked so this test controls the public key deterministically.
vi.mock('../../src/modules/notification/push', () => ({ vapidPublicKey: 'test-vapid-public-key' }));

// Mock BetterAuth so protected routes can be exercised without real sessions.
const getSession = vi.fn();
vi.mock('../../src/auth/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { notificationModule } from '../../src/modules/notification';

function sessionFor(userId: string) {
  return {
    user: {
      id: userId,
      email: 'x@example.com',
      name: 'X',
      emailVerified: true,
      role: 'user',
      phoneNumber: null,
      phoneNumberVerified: false,
    },
    session: { id: 's_1', userId, token: 'tok' },
  };
}

const now = new Date('2026-01-01T00:00:00.000Z');

function makeNotificationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'u_1',
    title: 'Subject',
    body: 'Body',
    channel: 'email',
    type: 'system',
    link: null,
    readAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('notification module', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    db.update.mockClear();
    db.delete.mockClear();
    getSession.mockReset();
    dbState.selectResult = [];
    dbState.selectQueue = [];
    dbState.insertResult = [];
    dbState.updateResult = [];
  });

  describe('GET /notifications', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await notificationModule.request('/notifications');
      expect(res.status).toBe(401);
    });

    it('returns the page newest-first with the unread count', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      const older = makeNotificationRow({ id: 'n_1', createdAt: new Date('2025-01-01') });
      const newer = makeNotificationRow({ id: 'n_2', createdAt: new Date('2026-01-01') });
      dbState.selectQueue = [[newer, older], [{ unreadCount: 3 }]];

      const res = await notificationModule.request('/notifications');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: Array<{ id: string }>;
        unreadCount: number;
        hasMore: boolean;
      };
      expect(body.items.map((n) => n.id)).toEqual(['n_2', 'n_1']);
      expect(body.unreadCount).toBe(3);
      expect(body.hasMore).toBe(false);
    });

    it('caps a page at `limit` and reports hasMore', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectQueue = [
        [makeNotificationRow({ id: 'n_1' }), makeNotificationRow({ id: 'n_2' }), makeNotificationRow({ id: 'n_3' })],
        [{ unreadCount: 0 }],
      ];

      const res = await notificationModule.request('/notifications?limit=2');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[]; hasMore: boolean };
      expect(body.items).toHaveLength(2);
      expect(body.hasMore).toBe(true);
    });

    it('serializes type and link through to the response', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectQueue = [
        [makeNotificationRow({ type: 'booking_request', link: 'https://example.test/trajets/abc' })],
        [{ unreadCount: 1 }],
      ];

      const res = await notificationModule.request('/notifications');
      const body = (await res.json()) as { items: Array<{ type: string; link: string | null }> };
      expect(body.items[0]).toMatchObject({
        type: 'booking_request',
        link: 'https://example.test/trajets/abc',
      });
    });
  });

  describe('GET /notifications/unread-count', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await notificationModule.request('/notifications/unread-count');
      expect(res.status).toBe(401);
    });

    it('returns the unread count for the caller', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectQueue = [[{ unreadCount: 5 }]];

      const res = await notificationModule.request('/notifications/unread-count');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ unreadCount: 5 });
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await notificationModule.request('/notifications/read-all', { method: 'PATCH' });
      expect(res.status).toBe(401);
    });

    it('marks every unread notification owned by the caller as read and reports how many', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.updateResult = [{ id: 'n_1' }, { id: 'n_2' }, { id: 'n_3' }];

      const res = await notificationModule.request('/notifications/read-all', { method: 'PATCH' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ updated: 3 });
    });

    it('reports zero when nothing was unread', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.updateResult = [];

      const res = await notificationModule.request('/notifications/read-all', { method: 'PATCH' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ updated: 0 });
    });
  });

  describe('PATCH /notifications/:id/read', () => {
    const id = '11111111-1111-4111-8111-111111111111';

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await notificationModule.request(`/notifications/${id}/read`, { method: 'PATCH' });
      expect(res.status).toBe(401);
    });

    it('marks the caller-owned notification as read', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.updateResult = [makeNotificationRow({ id, readAt: now })];

      const res = await notificationModule.request(`/notifications/${id}/read`, { method: 'PATCH' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; readAt: string | null };
      expect(body.id).toBe(id);
      expect(body.readAt).not.toBeNull();
    });

    it('returns 404 when the notification does not exist or belongs to someone else', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.updateResult = [];

      const res = await notificationModule.request(`/notifications/${id}/read`, { method: 'PATCH' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /notifications/preferences', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await notificationModule.request('/notifications/preferences');
      expect(res.status).toBe(401);
    });

    it('returns every channel on when the caller has no saved row', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectResult = [];

      const res = await notificationModule.request('/notifications/preferences');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ emailEnabled: true, inAppEnabled: true, pushEnabled: true });
    });

    it('returns the saved channel switches', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectResult = [
        { userId: 'u_1', emailEnabled: false, inAppEnabled: true, pushEnabled: false },
      ];

      const res = await notificationModule.request('/notifications/preferences');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ emailEnabled: false, inAppEnabled: true, pushEnabled: false });
    });
  });

  describe('PUT /notifications/preferences', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await notificationModule.request('/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailEnabled: false, inAppEnabled: true, pushEnabled: false }),
      });
      expect(res.status).toBe(401);
    });

    it('upserts and returns the saved switches', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.insertResult = [
        { userId: 'u_1', emailEnabled: false, inAppEnabled: true, pushEnabled: false },
      ];

      const res = await notificationModule.request('/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailEnabled: false, inAppEnabled: true, pushEnabled: false }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ emailEnabled: false, inAppEnabled: true, pushEnabled: false });
    });
  });

  describe('GET /notifications/push/vapid-public-key', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await notificationModule.request('/notifications/push/vapid-public-key');
      expect(res.status).toBe(401);
    });

    it('returns the configured public key', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      const res = await notificationModule.request('/notifications/push/vapid-public-key');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ publicKey: 'test-vapid-public-key' });
    });
  });

  describe('POST /notifications/push/subscribe', () => {
    const body = {
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'p1', auth: 'a1' },
    };

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await notificationModule.request('/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(401);
    });

    it('upserts the subscription for the caller', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));

      const res = await notificationModule.request('/notifications/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(204);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('POST /notifications/push/unsubscribe', () => {
    const body = { endpoint: 'https://push.example/1' };

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await notificationModule.request('/notifications/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(401);
    });

    it('deletes the caller-owned subscription', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));

      const res = await notificationModule.request('/notifications/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(204);
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
