import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hermetic: fake the Drizzle query builder so no real database is needed.
 * Each chain method returns `this`; the chain is also "thenable" so `await`
 * resolves at whatever point the code stops chaining.
 */
function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    values: () => chain,
    onConflictDoUpdate: () => chain,
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

const db = vi.hoisted(() => ({
  select: vi.fn(() => createChain(dbState.selectResult)),
  insert: vi.fn(() => createChain(dbState.insertResult)),
}));

vi.mock('../../src/db/client', () => ({ db }));

// Mock BetterAuth so protected routes can be exercised without real sessions.
const getSession = vi.fn();
vi.mock('../../src/auth/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { vehicleModule } from '../../src/modules/vehicle';

function sessionFor(id: string) {
  return {
    user: {
      id,
      email: `${id}@example.com`,
      name: 'Ada Lovelace',
      emailVerified: true,
      role: null,
      phoneNumber: null,
      phoneNumberVerified: false,
    },
    session: { id: 's_1', userId: id, token: 'tok' },
  };
}

const now = new Date();

function makeVehicleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ownerId: 'driver_1',
    make: 'Toyota',
    model: 'Corolla',
    color: 'Blue',
    seats: 4,
    plate: 'ABC123',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('vehicle module', () => {
  beforeEach(() => {
    dbState.selectResult = [];
    dbState.insertResult = [];
    db.select.mockClear();
    db.insert.mockClear();
    getSession.mockReset();
  });

  it('GET /vehicles/me returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await vehicleModule.request('/vehicles/me');
    expect(res.status).toBe(401);
  });

  it('GET /vehicles/me returns 404 when nothing declared yet', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.selectResult = [];
    const res = await vehicleModule.request('/vehicles/me');
    expect(res.status).toBe(404);
  });

  it('GET /vehicles/me returns the declared vehicle', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.selectResult = [makeVehicleRow()];
    const res = await vehicleModule.request('/vehicles/me');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ownerId: 'driver_1',
      make: 'Toyota',
      model: 'Corolla',
      color: 'Blue',
      seats: 4,
      plate: 'ABC123',
    });
  });

  it('PUT /vehicles/me returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await vehicleModule.request('/vehicles/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ make: 'Toyota', model: 'Corolla', color: 'Blue', seats: 4, plate: 'ABC123' }),
    });
    expect(res.status).toBe(401);
  });

  it('PUT /vehicles/me upserts and returns the saved vehicle', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.insertResult = [makeVehicleRow({ color: 'Red' })];
    const res = await vehicleModule.request('/vehicles/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ make: 'Toyota', model: 'Corolla', color: 'Red', seats: 4, plate: 'ABC123' }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ownerId: 'driver_1', color: 'Red' });
  });
});
