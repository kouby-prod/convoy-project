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
  // Queue for tests that need successive `select` calls (booking, then
  // trajet, then the messages page) to return different rows. Falls back to
  // `selectResult` for every call when left empty.
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

// Mock notifications entirely — real `notifyUser` looks up an email via `db`
// (the same mocked chain everything else shares) and calls the real
// `sendEmail`. Stubbing it out also lets tests assert who got notified.
const notifyUser = vi.fn();
vi.mock('../../src/modules/trajet/notifications', () => ({
  notifyUser: (...a: unknown[]) => notifyUser(...a),
  trajetUrl: (id: string) => `https://example.test/trajets/${id}`,
  trajetSearchUrl: () => 'https://example.test/trajets',
  describeTrip: (trip: { departureCity: string; arrivalCity: string; departureAt: Date }) =>
    `${trip.departureCity} to ${trip.arrivalCity} (departing ${trip.departureAt.toUTCString()})`,
}));

import { messageModule } from '../../src/modules/message';

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

const TRAJET_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

function makeBookingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: BOOKING_ID,
    trajetId: TRAJET_ID,
    passengerId: 'passenger_1',
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
    departureAt: now,
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

function makeMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MESSAGE_ID,
    bookingId: BOOKING_ID,
    senderId: 'passenger_1',
    body: 'Hi, what time works for you?',
    createdAt: now,
    ...overrides,
  };
}

describe('message module', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    getSession.mockReset();
    notifyUser.mockClear();
    dbState.selectResult = [];
    dbState.selectQueue = [];
    dbState.insertResult = [];
  });

  describe('POST /bookings/:bookingId/messages', () => {
    const url = `/bookings/${BOOKING_ID}/messages`;

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await messageModule.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'hello' }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 404 when the booking does not exist', async () => {
      getSession.mockResolvedValue(sessionFor('passenger_1'));
      dbState.selectResult = [];

      const res = await messageModule.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'hello' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 when the caller is neither the passenger nor the driver', async () => {
      getSession.mockResolvedValue(sessionFor('a-stranger'));
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow()]];

      const res = await messageModule.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'hello' }),
      });
      expect(res.status).toBe(403);
    });

    it('lets the passenger message the driver and notifies the driver', async () => {
      getSession.mockResolvedValue(sessionFor('passenger_1'));
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow()]];
      dbState.insertResult = [makeMessageRow({ senderId: 'passenger_1', body: 'Running 5 min late' })];

      const res = await messageModule.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Running 5 min late' }),
      });

      expect(res.status).toBe(201);
      const resBody = await res.json();
      expect(resBody).toMatchObject({
        id: MESSAGE_ID,
        bookingId: BOOKING_ID,
        senderId: 'passenger_1',
        body: 'Running 5 min late',
      });
      expect(notifyUser).toHaveBeenCalledWith(
        'driver_1',
        expect.stringContaining('New message'),
        expect.stringContaining('Running 5 min late'),
      );
    });

    it('lets the driver message the passenger and notifies the passenger', async () => {
      getSession.mockResolvedValue(sessionFor('driver_1'));
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow()]];
      dbState.insertResult = [makeMessageRow({ senderId: 'driver_1', body: "I'm outside" })];

      const res = await messageModule.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: "I'm outside" }),
      });

      expect(res.status).toBe(201);
      expect(notifyUser).toHaveBeenCalledWith(
        'passenger_1',
        expect.stringContaining('New message'),
        expect.stringContaining("I'm outside"),
      );
    });

    it('rejects an empty body', async () => {
      getSession.mockResolvedValue(sessionFor('passenger_1'));
      const res = await messageModule.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: '' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /bookings/:bookingId/messages', () => {
    const url = `/bookings/${BOOKING_ID}/messages`;

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await messageModule.request(url);
      expect(res.status).toBe(401);
    });

    it('returns 404 when the booking does not exist', async () => {
      getSession.mockResolvedValue(sessionFor('passenger_1'));
      dbState.selectResult = [];

      const res = await messageModule.request(url);
      expect(res.status).toBe(404);
    });

    it('returns 403 when the caller is neither the passenger nor the driver', async () => {
      getSession.mockResolvedValue(sessionFor('a-stranger'));
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow()]];

      const res = await messageModule.request(url);
      expect(res.status).toBe(403);
    });

    it('returns a page of messages, oldest first, for the passenger', async () => {
      getSession.mockResolvedValue(sessionFor('passenger_1'));
      dbState.selectQueue = [
        [makeBookingRow()],
        [makeTrajetRow()],
        [makeMessageRow(), makeMessageRow({ id: 'm_2', senderId: 'driver_1', body: 'Sure, see you then' })],
      ];

      const res = await messageModule.request(url);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: Array<{ id: string; senderId: string }>;
        page: number;
        limit: number;
        hasMore: boolean;
      };
      expect(body).toMatchObject({ page: 1, limit: 20, hasMore: false });
      expect(body.items).toHaveLength(2);
      expect(body.items[0]).toMatchObject({ id: MESSAGE_ID, senderId: 'passenger_1' });
      expect(body.items[1]).toMatchObject({ id: 'm_2', senderId: 'driver_1' });
    });

    it('returns a page of messages for the driver too', async () => {
      getSession.mockResolvedValue(sessionFor('driver_1'));
      dbState.selectQueue = [[makeBookingRow()], [makeTrajetRow()], [makeMessageRow()]];

      const res = await messageModule.request(url);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[] };
      expect(body.items).toHaveLength(1);
    });

    it('caps a page at `limit` items and reports hasMore', async () => {
      getSession.mockResolvedValue(sessionFor('passenger_1'));
      dbState.selectQueue = [
        [makeBookingRow()],
        [makeTrajetRow()],
        [makeMessageRow(), makeMessageRow({ id: 'm_2' }), makeMessageRow({ id: 'm_3' })],
      ];

      const res = await messageModule.request(`${url}?limit=2`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[]; hasMore: boolean };
      expect(body.items).toHaveLength(2);
      expect(body.hasMore).toBe(true);
    });
  });
});
