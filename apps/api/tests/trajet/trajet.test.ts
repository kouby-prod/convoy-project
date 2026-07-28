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
    leftJoin: () => chain,
    orderBy: () => chain,
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
    departurePlace: null,
    arrivalPlace: null,
    arrivalAt: null,
    seatsTotal: 3,
    seatsAvailable: 3,
    pricePerSeat: '20',
    description: 'A sample trajet',
    comfort: null,
    baggageAllowance: null,
    amenities: [],
    hasIntermediateStop: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** The driver account the reads join against. */
function makeUserRow(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'u_1', name: 'Ada Lovelace', email: 'ada@example.com', ...overrides };
}

/**
 * Reads select `{ trajet, driver }` through a leftJoin, so the mock must return
 * that shape rather than a flat row.
 */
function makeJoinedRow(
  trajetOverrides: Partial<Record<string, unknown>> = {},
  driverOverrides: Partial<Record<string, unknown>> | null = {},
) {
  return {
    trajet: makeTrajetRow(trajetOverrides),
    driver: driverOverrides === null ? null : makeUserRow(driverOverrides),
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
    dbState.selectResult = [makeJoinedRow()];
    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { destinationCity: string; pricePerSeat: number };
    expect(body.destinationCity).toBe('Quebec');
    expect(body.pricePerSeat).toBe(20);
  });

  it('GET /trajets embeds the joined driver, splitting the account name', async () => {
    dbState.selectResult = [makeJoinedRow()];
    const res = await trajetModule.request('/trajets');
    expect(res.status).toBe(200);
    const [first] = (await res.json()) as { driver: Record<string, unknown> }[];
    expect(first!.driver).toMatchObject({
      id: 'u_1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      // No vehicle table and no reviews yet — reported as unknown, never faked.
      carMake: null,
      carSeats: null,
      rating: null,
      reviewCount: null,
    });
  });

  it('GET /trajets falls back to the driver id when the account row is missing', async () => {
    dbState.selectResult = [makeJoinedRow({}, null)];
    const res = await trajetModule.request('/trajets');
    expect(res.status).toBe(200);
    const [first] = (await res.json()) as { driver: Record<string, unknown> }[];
    expect(first!.driver).toMatchObject({ id: 'u_1', firstName: '', lastName: '' });
  });

  it('GET /trajets returns amenities and the stop flag', async () => {
    dbState.selectResult = [
      makeJoinedRow({ amenities: ['nonSmoking', 'luggage'], hasIntermediateStop: true }),
    ];
    const res = await trajetModule.request('/trajets');
    const [first] = (await res.json()) as { amenities: string[]; hasIntermediateStop: boolean }[];
    expect(first!.amenities).toEqual(['nonSmoking', 'luggage']);
    expect(first!.hasIntermediateStop).toBe(true);
  });

  it('GET /trajets accepts the full search filter set', async () => {
    dbState.selectResult = [];
    const query =
      '?from=Montreal&to=Quebec&date=2026-08-15&time=09:00&seats=2&maxPrice=50' +
      '&amenities=nonSmoking,luggage&stopPolicy=direct';
    const res = await trajetModule.request(`/trajets${query}`);
    expect(res.status).toBe(200);
    expect(db.select).toHaveBeenCalled();
  });

  it('GET /trajets rejects an out-of-range seats filter', async () => {
    const res = await trajetModule.request('/trajets?seats=99');
    expect(res.status).toBe(400);
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
    dbState.selectResult = [makeJoinedRow()]; // the response re-reads via the join

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
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+15145550123',
        message: 'See you at the station',
        createdAt: now,
        updatedAt: now,
      },
    ];

    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seats: 2,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+15145550123',
        message: 'See you at the station',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    // The contact details the passenger typed are stored, not silently dropped.
    expect(body).toMatchObject({
      id: 'b_1',
      seats: 2,
      status: 'confirmed',
      firstName: 'Ada',
      email: 'ada@example.com',
      message: 'See you at the station',
    });
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
