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
    set: (values: unknown) => {
      dbState.setCalls.push(values);
      return chain;
    },
    innerJoin: () => chain,
    groupBy: () => chain,
    having: () => chain,
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
  // Queue for tests that need successive `select` calls (within one
  // transaction) to return different rows, e.g. trajet then booking. Falls
  // back to `selectResult` for every call when left empty.
  selectQueue: [] as unknown[][],
  insertResult: [] as unknown[],
  updateResult: [] as unknown[],
  // Same idea as `selectQueue`, for successive `update` calls — every
  // book/confirm-reject/cancel transaction now opens with a stale-pending
  // "expire" update before its own real update, so tests exercising a real
  // update result must queue an empty `[]` frame first (nothing expired) to
  // keep that first call from swallowing the result meant for the second.
  updateQueue: [] as unknown[][],
  // Every `.update(...).set(values)` call, in order — lets a test assert
  // exactly what was written (e.g. a recalculated `seatsAvailable`).
  setCalls: [] as unknown[],
}));

const db = vi.hoisted(() => {
  const instance = {
    select: vi.fn(() =>
      createChain(dbState.selectQueue.length ? dbState.selectQueue.shift() : dbState.selectResult),
    ),
    insert: vi.fn(() => createChain(dbState.insertResult)),
    update: vi.fn(() =>
      createChain(dbState.updateQueue.length ? dbState.updateQueue.shift() : dbState.updateResult),
    ),
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

// Mock notifications entirely: real `notifyUser` looks up an email via `db`
// (the same mocked chain everything else shares) and calls the real
// `sendEmail`, which — if SMTP_HOST happens to be set in the environment —
// would attempt a real SMTP connection during tests. Stubbing it out here
// also lets tests assert exactly who got notified and with what subject.
const notifyUser = vi.fn();
vi.mock('../../src/modules/trajet/notifications', () => ({
  notifyUser: (...a: unknown[]) => notifyUser(...a),
  trajetUrl: (id: string) => `https://example.test/trajets/${id}`,
  trajetSearchUrl: () => 'https://example.test/trajets',
  describeTrip: (trip: { departureCity: string; arrivalCity: string; departureAt: Date }) =>
    `${trip.departureCity} to ${trip.arrivalCity} (departing ${trip.departureAt.toUTCString()})`,
}));

// Mock the rate limiter entirely: its buckets persist for the lifetime of
// the `trajetModule` singleton, i.e. across every test in this file, so a
// real limiter would make these tests fail depending on how many other
// tests ran before them (see apps/api/tests/middleware/rate-limit.test.ts
// for real coverage of the limiting behaviour itself).
vi.mock('../../src/middleware/rate-limit', () => ({
  rateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
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
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const BOOKING_ID = '22222222-2222-4222-8222-222222222222';

function makeBookingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: BOOKING_ID,
    trajetId: '11111111-1111-4111-8111-111111111111',
    passengerId: 'u_2',
    seats: 2,
    status: 'pending',
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
    notifyUser.mockClear();
    dbState.selectResult = [];
    dbState.selectQueue = [];
    dbState.insertResult = [];
    dbState.updateResult = [];
    dbState.updateQueue = [];
    dbState.setCalls = [];
  });

  it('GET /trajets returns a paginated, empty page by default', async () => {
    dbState.selectResult = [];
    const res = await trajetModule.request('/trajets');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: [], page: 1, limit: 20, hasMore: false });
  });

  describe('GET /trajets search/filter query', () => {
    it('accepts a full set of valid filters', async () => {
      dbState.selectResult = [makeTrajetRow()];
      const res = await trajetModule.request(
        '/trajets?departureCity=Montreal&destinationCity=Quebec&date=2026-01-01' +
          '&minSeats=2&maxPrice=25&comfort=standard&baggageAllowance=valise',
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[] };
      expect(body.items).toHaveLength(1);
    });

    it('rejects an invalid date format', async () => {
      const res = await trajetModule.request('/trajets?date=not-a-date');
      expect(res.status).toBe(400);
    });

    it('rejects an invalid comfort value', async () => {
      const res = await trajetModule.request('/trajets?comfort=luxury');
      expect(res.status).toBe(400);
    });

    it('rejects a non-numeric maxPrice', async () => {
      const res = await trajetModule.request('/trajets?maxPrice=free');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /trajets driver rating', () => {
    it('attaches null driverRating/zero driverReviewCount when the driver has no reviews', async () => {
      dbState.selectQueue = [[makeTrajetRow({ driverId: 'u_1' })], []];
      const res = await trajetModule.request('/trajets');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Array<{ driverRating: number | null; driverReviewCount: number }> };
      expect(body.items[0]).toMatchObject({ driverRating: null, driverReviewCount: 0 });
    });

    it("attaches the driver's average rating when reviews exist", async () => {
      dbState.selectQueue = [
        [makeTrajetRow({ driverId: 'u_1' })],
        [{ driverId: 'u_1', averageRating: '4.5', reviewCount: 2 }],
      ];
      const res = await trajetModule.request('/trajets');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Array<{ driverRating: number | null; driverReviewCount: number }> };
      expect(body.items[0]).toMatchObject({ driverRating: 4.5, driverReviewCount: 2 });
    });

    it('filters out trajets whose driver is below minDriverRating', async () => {
      // First frame: no driver's average reaches the bar → the sentinel
      // inArray() means the main query (mocked here) would return nothing in
      // a real DB; this test just exercises that the endpoint doesn't error
      // and still shapes the response correctly.
      dbState.selectQueue = [[], [makeTrajetRow({ driverId: 'u_1' })], []];
      const res = await trajetModule.request('/trajets?minDriverRating=4');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[] };
      expect(body.items).toHaveLength(1);
    });

    it('rejects a minDriverRating above 5', async () => {
      const res = await trajetModule.request('/trajets?minDriverRating=6');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /trajets pagination', () => {
    it('caps a page at `limit` items and reports hasMore when an extra row exists', async () => {
      // 3 rows come back for a `limit=2` request — the "limit + 1" fetch
      // trick that signals there's a next page without a COUNT(*) query.
      dbState.selectResult = [makeTrajetRow(), makeTrajetRow(), makeTrajetRow()];
      const res = await trajetModule.request('/trajets?limit=2');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: unknown[];
        page: number;
        limit: number;
        hasMore: boolean;
      };
      expect(body.items).toHaveLength(2);
      expect(body).toMatchObject({ page: 1, limit: 2, hasMore: true });
    });

    it('reports hasMore false and echoes the requested page when the page is not full', async () => {
      dbState.selectResult = [makeTrajetRow()];
      const res = await trajetModule.request('/trajets?limit=2&page=3');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[]; page: number; hasMore: boolean };
      expect(body.items).toHaveLength(1);
      expect(body).toMatchObject({ page: 3, hasMore: false });
    });

    it('rejects a limit above 100', async () => {
      const res = await trajetModule.request('/trajets?limit=101');
      expect(res.status).toBe(400);
    });

    it('rejects a page below 1', async () => {
      const res = await trajetModule.request('/trajets?page=0');
      expect(res.status).toBe(400);
    });
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
        departureDateTime: new Date(Date.now() + 60_000).toISOString(),
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

  it('POST /trajets rejects a departureDateTime in the past', async () => {
    getSession.mockResolvedValue(sessionFor('user'));

    const res = await trajetModule.request('/trajets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        departureCity: 'Montreal',
        destinationCity: 'Quebec',
        departureDateTime: new Date(Date.now() - 60_000).toISOString(),
        seatsTotal: 3,
        pricePerSeat: 20,
      }),
    });

    expect(res.status).toBe(400);
  });

  describe('PATCH /trajets/:id', () => {
    const url = '/trajets/11111111-1111-4111-8111-111111111111';

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricePerSeat: 25 }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 404 when the trajet does not exist', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricePerSeat: 25 }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 when the caller is not the driver', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [makeTrajetRow({ driverId: 'someone-else' })];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricePerSeat: 25 }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 400 when the trajet is cancelled', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [makeTrajetRow({ driverId: 'u_1', cancelledAt: now })];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricePerSeat: 25 }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects a departureDateTime in the past', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [makeTrajetRow({ driverId: 'u_1' })];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departureDateTime: new Date(Date.now() - 60_000).toISOString() }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when seatsTotal is reduced below the seats already booked', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      // seatsTotal 3, seatsAvailable 1 → 2 seats already booked.
      dbState.selectResult = [makeTrajetRow({ driverId: 'u_1', seatsTotal: 3, seatsAvailable: 1 })];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatsTotal: 1 }),
      });
      expect(res.status).toBe(400);
    });

    it('updates the given fields and returns the updated trajet', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [makeTrajetRow({ driverId: 'u_1' })];
      dbState.updateResult = [makeTrajetRow({ driverId: 'u_1', pricePerSeat: '25' })];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pricePerSeat: 25 }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { pricePerSeat: number };
      expect(body.pricePerSeat).toBe(25);
    });

    it('recalculates seatsAvailable when seatsTotal changes, preserving already-booked seats', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      // seatsTotal 3, seatsAvailable 1 → 2 seats already booked.
      dbState.selectResult = [makeTrajetRow({ driverId: 'u_1', seatsTotal: 3, seatsAvailable: 1 })];
      dbState.updateResult = [makeTrajetRow({ driverId: 'u_1', seatsTotal: 5, seatsAvailable: 3 })];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatsTotal: 5 }),
      });

      expect(res.status).toBe(200);
      // 5 new total - 2 already booked = 3 available.
      expect(dbState.setCalls).toContainEqual(
        expect.objectContaining({ seatsTotal: 5, seatsAvailable: 3 }),
      );
    });
  });

  describe('DELETE /trajets/:id', () => {
    const url = '/trajets/11111111-1111-4111-8111-111111111111';

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await trajetModule.request(url, { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    it('returns 404 when the trajet does not exist', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [];

      const res = await trajetModule.request(url, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    it('returns 403 when the caller is not the driver', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [makeTrajetRow({ driverId: 'someone-else' })];

      const res = await trajetModule.request(url, { method: 'DELETE' });
      expect(res.status).toBe(403);
    });

    it('returns 400 when the trajet is already cancelled', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [makeTrajetRow({ driverId: 'u_1', cancelledAt: now })];

      const res = await trajetModule.request(url, { method: 'DELETE' });
      expect(res.status).toBe(400);
    });

    it('cancels the trajet and cascades to active bookings', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [makeTrajetRow({ driverId: 'u_1' })];
      dbState.updateQueue = [
        [makeTrajetRow({ driverId: 'u_1', cancelledAt: now })],
        [{ passengerId: 'u_2' }, { passengerId: 'u_3' }],
      ];

      const res = await trajetModule.request(url, { method: 'DELETE' });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { cancelledAt: string | null };
      expect(body.cancelledAt).not.toBeNull();
      // Trajet cancellation update + the booking cascade update.
      expect(db.update).toHaveBeenCalledTimes(2);
      expect(dbState.setCalls).toContainEqual({ status: 'cancelled' });
      expect(notifyUser).toHaveBeenCalledWith(
        'u_2',
        expect.stringContaining('cancelled'),
        expect.any(String),
      );
      expect(notifyUser).toHaveBeenCalledWith(
        'u_3',
        expect.stringContaining('cancelled'),
        expect.any(String),
      );
    });
  });

  it('POST /trajets/:id/book returns 400 when the trajet has been cancelled', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    dbState.selectResult = [makeTrajetRow({ driverId: 'someone-else', cancelledAt: now })];

    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seats: 1 }),
    });

    expect(res.status).toBe(400);
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

  it('POST /trajets/:id/book books seats as pending when enough are available', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    dbState.selectResult = [makeTrajetRow({ driverId: 'someone-else', seatsAvailable: 3 })];
    dbState.insertResult = [makeBookingRow({ passengerId: 'u_1', seats: 2, status: 'pending' })];

    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seats: 2 }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: BOOKING_ID, seats: 2, status: 'pending' });
    expect(notifyUser).toHaveBeenCalledWith(
      'someone-else',
      expect.stringContaining('New booking request'),
      expect.any(String),
    );
  });

  it('POST /trajets/:id/book returns 403 when the caller is the trajet driver', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    dbState.selectResult = [makeTrajetRow({ driverId: 'u_1', seatsAvailable: 3 })];

    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seats: 1 }),
    });

    expect(res.status).toBe(403);
  });

  it('POST /trajets/:id/book returns 400 when not enough seats are available', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    dbState.selectResult = [makeTrajetRow({ driverId: 'someone-else', seatsAvailable: 1 })];

    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seats: 2 }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /trajets/:id/book expires a stale pending booking and books with the freed seats', async () => {
    getSession.mockResolvedValue(sessionFor('user'));
    // Fully booked at rest, but one pending request (2 seats) is past the TTL.
    dbState.selectResult = [makeTrajetRow({ driverId: 'someone-else', seatsAvailable: 0 })];
    dbState.updateQueue = [[{ passengerId: 'u_3', seats: 2 }]];
    dbState.insertResult = [makeBookingRow({ passengerId: 'u_1', seats: 2, status: 'pending' })];

    const res = await trajetModule.request('/trajets/11111111-1111-4111-8111-111111111111/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seats: 2 }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: BOOKING_ID, seats: 2, status: 'pending' });
    // Sweep's expire update + the trajet restock it triggers + this booking's
    // own seatsAvailable decrement.
    expect(db.update).toHaveBeenCalledTimes(3);
    // The passenger whose stale request just expired, and the driver of the new one.
    expect(notifyUser).toHaveBeenCalledWith(
      'u_3',
      expect.stringContaining('expired'),
      expect.any(String),
    );
    expect(notifyUser).toHaveBeenCalledWith(
      'someone-else',
      expect.stringContaining('New booking request'),
      expect.any(String),
    );
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

  describe('GET /trajets/:id/bookings', () => {
    const url = '/trajets/11111111-1111-4111-8111-111111111111/bookings';

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await trajetModule.request(url);
      expect(res.status).toBe(401);
    });

    it('returns 404 when the trajet does not exist', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [];

      const res = await trajetModule.request(url);
      expect(res.status).toBe(404);
    });

    it('returns 403 when the caller is not the driver', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [makeTrajetRow({ driverId: 'someone-else' })];

      const res = await trajetModule.request(url);
      expect(res.status).toBe(403);
    });

    it('returns a page of bookings for the trajet when the caller is the driver', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectQueue = [
        [makeTrajetRow({ driverId: 'u_1' })],
        [makeBookingRow({ status: 'pending' }), makeBookingRow({ id: 'b_2', status: 'confirmed' })],
      ];

      const res = await trajetModule.request(url);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: Array<{ id: string; status: string }>;
        page: number;
        limit: number;
        hasMore: boolean;
      };
      expect(body).toMatchObject({ page: 1, limit: 20, hasMore: false });
      expect(body.items).toHaveLength(2);
      expect(body.items[0]).toMatchObject({ id: BOOKING_ID, status: 'pending' });
      expect(body.items[1]).toMatchObject({ id: 'b_2', status: 'confirmed' });
    });

    it('rejects an out-of-range limit', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      const res = await trajetModule.request(`${url}?limit=0`);
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /trajets/:id/bookings/:bookingId', () => {
    const url = `/trajets/11111111-1111-4111-8111-111111111111/bookings/${BOOKING_ID}`;

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 404 when the trajet does not exist', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 when the caller is not the driver', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [makeTrajetRow({ driverId: 'someone-else' })];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 when the booking does not exist', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectQueue = [[makeTrajetRow({ driverId: 'u_1' })], []];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 when the booking is not pending', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectQueue = [
        [makeTrajetRow({ driverId: 'u_1' })],
        [makeBookingRow({ status: 'confirmed' })],
      ];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });
      expect(res.status).toBe(400);
    });

    it('confirms a pending booking without restocking seats', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectQueue = [
        [makeTrajetRow({ driverId: 'u_1', seatsAvailable: 1 })],
        [makeBookingRow({ status: 'pending', seats: 2 })],
      ];
      // First frame: the stale-pending sweep finds nothing to expire.
      dbState.updateQueue = [[]];
      dbState.updateResult = [makeBookingRow({ status: 'confirmed', seats: 2 })];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ id: BOOKING_ID, status: 'confirmed' });
      // Sweep (no-op) + the booking update — seats stay held, no trajet update.
      expect(db.update).toHaveBeenCalledTimes(2);
      expect(notifyUser).toHaveBeenCalledWith(
        'u_2',
        expect.stringContaining('confirmed'),
        expect.any(String),
      );
    });

    it('rejects a pending booking and restocks the seats', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectQueue = [
        [makeTrajetRow({ driverId: 'u_1', seatsAvailable: 1 })],
        [makeBookingRow({ status: 'pending', seats: 2 })],
      ];
      // First frame: the stale-pending sweep finds nothing to expire.
      dbState.updateQueue = [[]];
      dbState.updateResult = [makeBookingRow({ status: 'rejected', seats: 2 })];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ id: BOOKING_ID, status: 'rejected' });
      // Sweep (no-op) + booking update + trajet seatsAvailable restock.
      expect(db.update).toHaveBeenCalledTimes(3);
      expect(notifyUser).toHaveBeenCalledWith(
        'u_2',
        expect.stringContaining('rejected'),
        expect.any(String),
      );
    });

    it('returns 400 when the booking has since expired (TTL passed)', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      const staleBooking = makeBookingRow({ status: 'expired', seats: 2 });
      dbState.selectQueue = [[makeTrajetRow({ driverId: 'u_1', seatsAvailable: 1 })], [staleBooking]];
      // The sweep expires one stale booking (2 seats) before the booking
      // itself is fetched — it's already `expired` by the time the handler
      // reads it, so the existing "not pending" check catches it.
      dbState.updateQueue = [[{ passengerId: 'u_3', seats: 2 }]];

      const res = await trajetModule.request(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });

      expect(res.status).toBe(400);
      // Sweep's expire update + the trajet seatsAvailable restock it triggers.
      expect(db.update).toHaveBeenCalledTimes(2);
      expect(notifyUser).toHaveBeenCalledWith(
        'u_3',
        expect.stringContaining('expired'),
        expect.any(String),
      );
    });
  });

  describe('POST /trajets/:id/bookings/:bookingId/cancel', () => {
    const url = `/trajets/11111111-1111-4111-8111-111111111111/bookings/${BOOKING_ID}/cancel`;

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await trajetModule.request(url, { method: 'POST' });
      expect(res.status).toBe(401);
    });

    it('returns 404 when the trajet does not exist', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [];

      const res = await trajetModule.request(url, { method: 'POST' });
      expect(res.status).toBe(404);
    });

    it('returns 404 when the booking does not exist', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectQueue = [[makeTrajetRow()], []];

      const res = await trajetModule.request(url, { method: 'POST' });
      expect(res.status).toBe(404);
    });

    it('returns 403 when the caller is not the passenger who booked', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectQueue = [[makeTrajetRow()], [makeBookingRow({ passengerId: 'someone-else' })]];

      const res = await trajetModule.request(url, { method: 'POST' });
      expect(res.status).toBe(403);
    });

    it('returns 400 when the booking is already rejected', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectQueue = [
        [makeTrajetRow()],
        [makeBookingRow({ passengerId: 'u_1', status: 'rejected' })],
      ];

      const res = await trajetModule.request(url, { method: 'POST' });
      expect(res.status).toBe(400);
    });

    it('cancels a pending booking and restocks the seats', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectQueue = [
        [makeTrajetRow({ seatsAvailable: 1 })],
        [makeBookingRow({ passengerId: 'u_1', status: 'pending', seats: 2 })],
      ];
      // First frame: the stale-pending sweep finds nothing to expire.
      dbState.updateQueue = [[]];
      dbState.updateResult = [makeBookingRow({ passengerId: 'u_1', status: 'cancelled', seats: 2 })];

      const res = await trajetModule.request(url, { method: 'POST' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ id: BOOKING_ID, status: 'cancelled' });
      // Sweep (no-op) + booking update + trajet seatsAvailable restock.
      expect(db.update).toHaveBeenCalledTimes(3);
      expect(notifyUser).toHaveBeenCalledWith(
        'u_1',
        expect.stringContaining('cancelled'),
        expect.any(String),
      );
    });

    it('cancels a confirmed booking and restocks the seats', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectQueue = [
        [makeTrajetRow({ seatsAvailable: 0 })],
        [makeBookingRow({ passengerId: 'u_1', status: 'confirmed', seats: 2 })],
      ];
      // First frame: the stale-pending sweep finds nothing to expire.
      dbState.updateQueue = [[]];
      dbState.updateResult = [makeBookingRow({ passengerId: 'u_1', status: 'cancelled', seats: 2 })];

      const res = await trajetModule.request(url, { method: 'POST' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ id: BOOKING_ID, status: 'cancelled' });
      // Sweep (no-op) + booking update + trajet seatsAvailable restock.
      expect(db.update).toHaveBeenCalledTimes(3);
      expect(notifyUser).toHaveBeenCalledWith(
        'u_1',
        expect.stringContaining('cancelled'),
        expect.any(String),
      );
    });

    it('expires a stale pending booking instead of cancelling it, freeing its seats', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      const staleBooking = makeBookingRow({ passengerId: 'u_1', status: 'expired', seats: 2 });
      dbState.selectQueue = [[makeTrajetRow({ seatsAvailable: 1 })], [staleBooking]];
      // The sweep expires this booking (2 seats) before it's fetched — it's
      // already `expired` by the time the handler reads it, so the existing
      // "cannot be cancelled" check catches it instead of a redundant cancel.
      dbState.updateQueue = [[{ passengerId: 'u_3', seats: 2 }]];

      const res = await trajetModule.request(url, { method: 'POST' });

      expect(res.status).toBe(400);
      // Sweep's expire update + the trajet seatsAvailable restock it triggers.
      expect(db.update).toHaveBeenCalledTimes(2);
      expect(notifyUser).toHaveBeenCalledWith(
        'u_3',
        expect.stringContaining('expired'),
        expect.any(String),
      );
    });
  });

  describe('GET /me/trajets', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await trajetModule.request('/me/trajets');
      expect(res.status).toBe(401);
    });

    it("returns a page of the current user's trajets", async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [makeTrajetRow({ driverId: 'u_1' })];

      const res = await trajetModule.request('/me/trajets');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: Array<{ driverId: string }>;
        page: number;
        limit: number;
        hasMore: boolean;
      };
      expect(body).toMatchObject({ page: 1, limit: 20, hasMore: false });
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ driverId: 'u_1' });
    });

    it('caps a page at `limit` items and reports hasMore', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [
        makeTrajetRow({ driverId: 'u_1' }),
        makeTrajetRow({ id: 't_2', driverId: 'u_1' }),
        makeTrajetRow({ id: 't_3', driverId: 'u_1' }),
      ];

      const res = await trajetModule.request('/me/trajets?limit=2');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[]; hasMore: boolean };
      expect(body.items).toHaveLength(2);
      expect(body.hasMore).toBe(true);
    });

    it('rejects a page below 1', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      const res = await trajetModule.request('/me/trajets?page=0');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /me/bookings', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await trajetModule.request('/me/bookings');
      expect(res.status).toBe(401);
    });

    it("returns a page of the current user's bookings with a trajet summary", async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      dbState.selectResult = [
        {
          id: BOOKING_ID,
          trajetId: '11111111-1111-4111-8111-111111111111',
          passengerId: 'u_1',
          seats: 2,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          departureCity: 'Montreal',
          arrivalCity: 'Quebec',
          departureAt: now,
          pricePerSeat: '20',
        },
      ];

      const res = await trajetModule.request('/me/bookings');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: Array<{ id: string; trajet: { destinationCity: string; pricePerSeat: number } }>;
        page: number;
        limit: number;
        hasMore: boolean;
      };
      expect(body).toMatchObject({ page: 1, limit: 20, hasMore: false });
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ id: BOOKING_ID });
      expect(body.items[0]?.trajet).toMatchObject({ destinationCity: 'Quebec', pricePerSeat: 20 });
    });

    it('rejects a page below 1', async () => {
      getSession.mockResolvedValue(sessionFor('user'));
      const res = await trajetModule.request('/me/bookings?page=0');
      expect(res.status).toBe(400);
    });
  });
});
