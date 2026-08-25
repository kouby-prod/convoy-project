import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hermetic: fake the Drizzle query builder so no real database is needed.
 * Mirrors the harness in apps/api/tests/trajet/trajet.test.ts.
 */
function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    values: () => chain,
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
  // Queue for tests that need successive `select` calls (booking, then
  // trajet, then any existing review) to return different rows. Falls back
  // to `selectResult` for every call when left empty.
  selectQueue: [] as unknown[][],
  insertResult: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  select: vi.fn(() =>
    createChain(dbState.selectQueue.length ? dbState.selectQueue.shift() : dbState.selectResult),
  ),
  insert: vi.fn(() => createChain(dbState.insertResult)),
}));

vi.mock('../../src/db/client', () => ({ db }));

// Mock BetterAuth so protected routes can be exercised without real sessions.
const getSession = vi.fn();
vi.mock('../../src/auth/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { reviewModule } from '../../src/modules/review';

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

const now = new Date();
const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);

const TRAJET_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
const REVIEW_ID = '33333333-3333-4333-8333-333333333333';

function makeBookingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: BOOKING_ID,
    trajetId: TRAJET_ID,
    passengerId: 'u_1',
    seats: 2,
    status: 'confirmed',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTrajetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TRAJET_ID,
    driverId: 'driver_1',
    departureCity: 'Montreal',
    arrivalCity: 'Quebec',
    departureAt: past,
    seatsTotal: 3,
    seatsAvailable: 1,
    pricePerSeat: '20',
    description: null,
    comfort: null,
    baggageAllowance: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeReviewRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REVIEW_ID,
    trajetId: TRAJET_ID,
    bookingId: BOOKING_ID,
    driverId: 'driver_1',
    passengerId: 'u_1',
    direction: 'passenger_to_driver',
    rating: 5,
    comment: 'Great trip!',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('review module', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    getSession.mockReset();
    dbState.selectResult = [];
    dbState.selectQueue = [];
    dbState.insertResult = [];
  });

  describe('POST /reviews', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 5 }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 404 when the booking does not exist', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectResult = [];

      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 5 }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 when the caller is neither the passenger nor the driver of the booking', async () => {
      getSession.mockResolvedValue(sessionFor('a-stranger'));
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow()]];

      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 5 }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 400 when the booking is not confirmed', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectResult = [makeBookingRow({ status: 'pending' })];

      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 5 }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when the booking is still awaiting payment', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectResult = [makeBookingRow({ status: 'awaiting_payment' })];

      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 5 }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when the trip hasn't departed yet", async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow({ departureAt: future })]];

      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 5 }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when the booking has already been reviewed', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow()], [makeReviewRow()]];

      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 4 }),
      });
      expect(res.status).toBe(400);
    });

    it('creates a review for a completed, confirmed booking', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow()], []];
      dbState.insertResult = [makeReviewRow({ rating: 4, comment: 'Nice ride' })];

      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 4, comment: 'Nice ride' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({
        id: REVIEW_ID,
        trajetId: TRAJET_ID,
        bookingId: BOOKING_ID,
        driverId: 'driver_1',
        passengerId: 'u_1',
        direction: 'passenger_to_driver',
        rating: 4,
        comment: 'Nice ride',
      });
    });

    it('rejects an out-of-range rating', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 6 }),
      });
      expect(res.status).toBe(400);
    });

    it("lets the driver rate the passenger (direction: driver_to_passenger)", async () => {
      getSession.mockResolvedValue(sessionFor('driver_1'));
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow()], []];
      dbState.insertResult = [
        makeReviewRow({ direction: 'driver_to_passenger', rating: 3, comment: 'Quiet passenger' }),
      ];

      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 3, comment: 'Quiet passenger' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({
        driverId: 'driver_1',
        passengerId: 'u_1',
        direction: 'driver_to_passenger',
        rating: 3,
      });
    });

    it('lets the driver rate the passenger even if the passenger already rated the driver (independent per direction)', async () => {
      getSession.mockResolvedValue(sessionFor('driver_1'));
      // The "already reviewed" lookup is scoped to this direction, so an
      // existing passenger_to_driver review must not block this one.
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow()], []];
      dbState.insertResult = [makeReviewRow({ direction: 'driver_to_passenger', rating: 5 })];

      const res = await reviewModule.request('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID, rating: 5 }),
      });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /drivers/:driverId/reviews', () => {
    it('returns an empty page by default', async () => {
      dbState.selectResult = [];
      const res = await reviewModule.request('/drivers/driver_1/reviews');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ items: [], page: 1, limit: 20, hasMore: false });
    });

    it('caps a page at `limit` items and reports hasMore', async () => {
      dbState.selectResult = [makeReviewRow(), makeReviewRow({ id: 'r_2' }), makeReviewRow({ id: 'r_3' })];
      const res = await reviewModule.request('/drivers/driver_1/reviews?limit=2');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[]; hasMore: boolean };
      expect(body.items).toHaveLength(2);
      expect(body.hasMore).toBe(true);
    });
  });

  describe('GET /drivers/:driverId/rating', () => {
    it('returns a null average and zero count when the driver has no reviews', async () => {
      dbState.selectResult = [{ averageRating: null, reviewCount: 0 }];
      const res = await reviewModule.request('/drivers/driver_1/rating');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ averageRating: null, reviewCount: 0 });
    });

    it('returns the computed average and count when the driver has reviews', async () => {
      dbState.selectResult = [{ averageRating: '4.5', reviewCount: 2 }];
      const res = await reviewModule.request('/drivers/driver_1/rating');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ averageRating: 4.5, reviewCount: 2 });
    });
  });

  describe('GET /passengers/:passengerId/reviews', () => {
    it('returns an empty page by default', async () => {
      dbState.selectResult = [];
      const res = await reviewModule.request('/passengers/u_1/reviews');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ items: [], page: 1, limit: 20, hasMore: false });
    });

    it('caps a page at `limit` items and reports hasMore', async () => {
      dbState.selectResult = [
        makeReviewRow({ direction: 'driver_to_passenger' }),
        makeReviewRow({ id: 'r_2', direction: 'driver_to_passenger' }),
        makeReviewRow({ id: 'r_3', direction: 'driver_to_passenger' }),
      ];
      const res = await reviewModule.request('/passengers/u_1/reviews?limit=2');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[]; hasMore: boolean };
      expect(body.items).toHaveLength(2);
      expect(body.hasMore).toBe(true);
    });
  });

  describe('GET /passengers/:passengerId/rating', () => {
    it('returns a null average and zero count when the passenger has no reviews', async () => {
      dbState.selectResult = [{ averageRating: null, reviewCount: 0 }];
      const res = await reviewModule.request('/passengers/u_1/rating');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ averageRating: null, reviewCount: 0 });
    });

    it('returns the computed average and count when the passenger has reviews', async () => {
      dbState.selectResult = [{ averageRating: '3.5', reviewCount: 4 }];
      const res = await reviewModule.request('/passengers/u_1/rating');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ averageRating: 3.5, reviewCount: 4 });
    });
  });
});
