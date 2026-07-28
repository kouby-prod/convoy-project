import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hermetic: fake the Drizzle query builder so no real database is needed.
 * Each chain method returns `this`; the chain is also "thenable" so `await`
 * resolves at whatever point the code stops chaining (mirrors how the real
 * query builder works).
 */
function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    for: () => chain,
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
  insertResult: [] as unknown[],
}));

const db = vi.hoisted(() => {
  const instance = {
    select: vi.fn(() => createChain(dbState.selectResult)),
    insert: vi.fn(() => createChain(dbState.insertResult)),
    update: vi.fn(() => createChain(undefined)),
    transaction: vi.fn((cb: (tx: typeof instance) => unknown) => cb(instance)),
  };
  return instance;
});

vi.mock('../../src/db/client', () => ({ db }));

// Mock BetterAuth so protected routes can be exercised without real sessions.
const getSession = vi.fn();
vi.mock('../../src/auth/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { trajetModule } from '../../src/modules/trajet';

function sessionFor(role: string | null) {
  return {
    user: {
      id: 'u_1',
      email: 'x@example.com',
      name: 'X',
      emailVerified: true,
      role,
      phoneNumber: null,
      phoneNumberVerified: false,
    },
    session: { id: 's_1', userId: 'u_1', token: 'tok' },
  };
}

const now = new Date();

function makeTrajetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    driverId: 'u_1',
    departureCity: 'Montreal',
    arrivalCity: 'Quebec',
    departureAt: now,
    seatsTotal: 3,
    seatsAvailable: 3,
    pricePerSeat: '20',
    description: 'A sample trajet',
    comfort: null,
    baggageAllowance: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('trajet module', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    db.update.mockClear();
    db.transaction.mockClear();
    getSession.mockReset();
    dbState.selectResult = [];
    dbState.insertResult = [];
  });

  it('GET /trajets returns a list', async () => {
    dbState.selectResult = [];
    const res = await trajetModule.request('/trajets');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it('GET /trajets/:id returns 404 when missing', async () => {
    dbState.selectResult = [];
    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(404);
  });

  it('GET /trajets/:id returns the trajet', async () => {
    dbState.selectResult = [makeTrajetRow()];
    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { destinationCity: string; pricePerSeat: number };
    expect(body.destinationCity).toBe('Quebec');
    expect(body.pricePerSeat).toBe(20);
  });

  it('POST /trajets returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await trajetModule.request('/trajets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        departureCity: 'Montreal',
        destinationCity: 'Quebec',
        departureDateTime: new Date().toISOString(),
        seatsTotal: 3,
        pricePerSeat: 20,
      }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /trajets creates a trajet when authenticated', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    dbState.insertResult = [makeTrajetRow()];

    const res = await trajetModule.request('/trajets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        departureCity: 'Montreal',
        destinationCity: 'Quebec',
        departureDateTime: now.toISOString(),
        seatsTotal: 3,
        pricePerSeat: 20,
        description: 'A sample trajet',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      driverId: 'u_1',
      departureCity: 'Montreal',
      destinationCity: 'Quebec',
      seatsTotal: 3,
      seatsAvailable: 3,
      pricePerSeat: 20,
    });
  });

  it('POST /trajets/:id/book returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seats: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /trajets/:id/book books seats when enough are available', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    dbState.selectResult = [makeTrajetRow({ seatsAvailable: 3 })];
    dbState.insertResult = [
      {
        id: 'b_1',
        trajetId: '11111111-1111-4111-8111-111111111111',
        passengerId: 'u_1',
        seats: 2,
        status: 'confirmed',
        createdAt: now,
        updatedAt: now,
      },
    ];

    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seats: 2 }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: 'b_1', seats: 2, status: 'confirmed' });
  });

  it('POST /trajets/:id/book returns 400 when not enough seats are available', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    dbState.selectResult = [makeTrajetRow({ seatsAvailable: 1 })];

    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seats: 2 }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /trajets/:id/book returns 404 when the trajet does not exist', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    dbState.selectResult = [];

    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seats: 1 }),
    });

    expect(res.status).toBe(404);
  });
});
