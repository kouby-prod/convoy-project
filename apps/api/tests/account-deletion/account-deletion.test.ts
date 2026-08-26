import { beforeEach, describe, expect, it, vi } from 'vitest';

function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    values: () => chain,
    set: () => chain,
    returning: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const dbState = vi.hoisted(() => ({
  selectResult: [] as unknown[],
  selectQueue: [] as unknown[][],
  insertResult: [] as unknown[],
  deleteResult: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  select: vi.fn(() =>
    createChain(dbState.selectQueue.length ? dbState.selectQueue.shift() : dbState.selectResult),
  ),
  insert: vi.fn(() => createChain(dbState.insertResult)),
  delete: vi.fn(() => createChain(dbState.deleteResult)),
}));

const getSession = vi.fn();
const verifyPassword = vi.fn();
const sendEmail = vi.fn();

vi.mock('../../src/db/client', () => ({ db }));
vi.mock('../../src/auth/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));
vi.mock('better-auth/crypto', () => ({
  verifyPassword: (...a: unknown[]) => verifyPassword(...a),
}));
vi.mock('../../src/auth/email', () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

import { accountDeletionModule } from '../../src/modules/account-deletion';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@carpool/schemas';

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

const requestedAt = new Date('2026-01-01T00:00:00.000Z');
const purgeAt = new Date('2026-01-31T00:00:00.000Z');

describe('account deletion module', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    db.delete.mockClear();
    getSession.mockReset();
    verifyPassword.mockReset();
    sendEmail.mockReset();
    dbState.selectResult = [];
    dbState.selectQueue = [];
    dbState.insertResult = [];
    dbState.deleteResult = [];
    sendEmail.mockResolvedValue(undefined);
    verifyPassword.mockResolvedValue(true);
  });

  describe('GET /account/deletion', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await accountDeletionModule.request('/account/deletion');
      expect(res.status).toBe(401);
    });

    it('returns unscheduled status when no hold exists', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectQueue = [[], [{ password: 'hash', providerId: 'credential' }]];

      const res = await accountDeletionModule.request('/account/deletion');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        scheduled: false,
        requestedAt: null,
        purgeAt: null,
        retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
        passwordRequired: true,
      });
    });
  });

  describe('POST /account/deletion', () => {
    it('rejects a missing password when the account has one', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectQueue = [[], [{ password: 'hash', providerId: 'credential' }]];

      const res = await accountDeletionModule.request('/account/deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('schedules a 30-day hold after a correct password', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectQueue = [
        [],
        [{ password: 'hash', providerId: 'credential' }],
        [
          {
            userId: 'u_1',
            requestedAt,
            purgeAt,
          },
        ],
        [{ password: 'hash', providerId: 'credential' }],
      ];

      const res = await accountDeletionModule.request('/account/deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'DevPass123!' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { scheduled: boolean; purgeAt: string };
      expect(body.scheduled).toBe(true);
      expect(body.purgeAt).toBe(purgeAt.toISOString());
      expect(db.insert).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalled();
    });
  });

  describe('DELETE /account/deletion', () => {
    it('cancels a pending hold', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.deleteResult = [{ userId: 'u_1' }];
      dbState.selectQueue = [[], []];

      const res = await accountDeletionModule.request('/account/deletion', { method: 'DELETE' });
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ scheduled: false });
    });

    it('returns 404 when nothing is scheduled', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.deleteResult = [];

      const res = await accountDeletionModule.request('/account/deletion', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });
});
