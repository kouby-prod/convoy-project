import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hermetic: fake the Drizzle query builder so no real database is needed.
 * Mirrors the harness in apps/api/tests/message/message.test.ts.
 */
function createChain(result: unknown) {
  return {
    from: () => ({
      where: () => Promise.resolve(result),
    }),
  };
}

const dbState = vi.hoisted(() => ({
  // Each call to `db.select` shifts one entry — first is the trajet lookup,
  // second (only reached for non-driver callers past the window/cancellation
  // checks) is the confirmed-booking lookup.
  selectQueue: [] as unknown[][],
}));

const db = vi.hoisted(() => ({
  select: vi.fn(() => createChain(dbState.selectQueue.shift() ?? [])),
}));
vi.mock('../../src/db/client', () => ({ db }));

import { resolveTrajetLocationAccess } from '../../src/modules/tracking/access';

const TRAJET_ID = '11111111-1111-4111-8111-111111111111';
const DRIVER_ID = 'driver_1';
const PASSENGER_ID = 'passenger_1';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const DEPARTURE_AT = new Date('2026-06-15T12:30:00.000Z'); // 30 min from NOW — inside the window

function trajetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TRAJET_ID,
    driverId: DRIVER_ID,
    departureAt: DEPARTURE_AT,
    arrivalAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

describe('resolveTrajetLocationAccess', () => {
  beforeEach(() => {
    db.select.mockClear();
    dbState.selectQueue = [];
  });

  it('returns 404 when the trajet does not exist', async () => {
    dbState.selectQueue = [[]];

    const result = await resolveTrajetLocationAccess(TRAJET_ID, PASSENGER_ID, NOW);

    expect(result).toEqual({ ok: false, status: 404, error: 'Trajet not found' });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('grants the driver access within the sharing window, without checking any booking', async () => {
    dbState.selectQueue = [[trajetRow()]];

    const result = await resolveTrajetLocationAccess(TRAJET_ID, DRIVER_ID, NOW);

    expect(result).toEqual({ ok: true, isDriver: true });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('grants a passenger with a confirmed booking access, marked as not the driver', async () => {
    dbState.selectQueue = [[trajetRow()], [{ id: 'booking_1' }]];

    const result = await resolveTrajetLocationAccess(TRAJET_ID, PASSENGER_ID, NOW);

    expect(result).toEqual({ ok: true, isDriver: false });
  });

  it('denies a passenger with no confirmed booking on this trajet', async () => {
    dbState.selectQueue = [[trajetRow()], []];

    const result = await resolveTrajetLocationAccess(TRAJET_ID, PASSENGER_ID, NOW);

    expect(result).toEqual({ ok: false, status: 403, error: 'Not authorized for this trajet' });
  });

  it('denies the driver when the trajet is cancelled, even inside the window', async () => {
    dbState.selectQueue = [[trajetRow({ cancelledAt: new Date('2026-06-14T00:00:00.000Z') })]];

    const result = await resolveTrajetLocationAccess(TRAJET_ID, DRIVER_ID, NOW);

    expect(result).toEqual({ ok: false, status: 403, error: 'Trajet is cancelled' });
  });

  it('denies access more than 2h before departure', async () => {
    dbState.selectQueue = [[trajetRow({ departureAt: new Date('2026-06-15T14:30:01.000Z') })]];

    const result = await resolveTrajetLocationAccess(TRAJET_ID, DRIVER_ID, NOW);

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'Outside the live-sharing window for this trajet',
    });
  });

  it('grants access exactly 2h before departure (window edge)', async () => {
    dbState.selectQueue = [[trajetRow({ departureAt: new Date('2026-06-15T14:00:00.000Z') })]];

    const result = await resolveTrajetLocationAccess(TRAJET_ID, DRIVER_ID, NOW);

    expect(result).toEqual({ ok: true, isDriver: true });
  });

  it('denies access more than 12h after departure when there is no estimated arrival', async () => {
    dbState.selectQueue = [
      [trajetRow({ departureAt: new Date('2026-06-14T23:59:59.999Z'), arrivalAt: null })],
    ];

    const result = await resolveTrajetLocationAccess(TRAJET_ID, DRIVER_ID, NOW);

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'Outside the live-sharing window for this trajet',
    });
  });

  it('allows a 2h grace period past the estimated arrival, then denies past it', async () => {
    const departureAt = new Date('2026-06-15T10:00:00.000Z');
    const arrivalAt = new Date('2026-06-15T11:00:00.000Z');

    const stillWithinGrace = await (async () => {
      dbState.selectQueue = [[trajetRow({ departureAt, arrivalAt })]];
      return resolveTrajetLocationAccess(TRAJET_ID, DRIVER_ID, new Date('2026-06-15T13:00:00.000Z'));
    })();
    expect(stillWithinGrace).toEqual({ ok: true, isDriver: true });

    const pastGrace = await (async () => {
      dbState.selectQueue = [[trajetRow({ departureAt, arrivalAt })]];
      return resolveTrajetLocationAccess(TRAJET_ID, DRIVER_ID, new Date('2026-06-15T13:00:01.000Z'));
    })();
    expect(pastGrace).toEqual({
      ok: false,
      status: 403,
      error: 'Outside the live-sharing window for this trajet',
    });
  });
});
