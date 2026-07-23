import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic: mock the DB client so no real database is needed. `poolQuery`
// controls the query results returned by the domain module.
const poolQuery = vi.fn();
vi.mock('../../src/db/client', () => ({
  pool: { query: (...args: unknown[]) => poolQuery(...args) },
}));

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

describe('trajet module', () => {
  beforeEach(() => {
    poolQuery.mockReset();
    getSession.mockReset();
  });

  it('GET /trajets returns a list', async () => {
    poolQuery.mockResolvedValue({ rows: [] });
    const res = await trajetModule.request('/trajets');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
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
    const expectedRow = {
      id: '11111111-1111-4111-8111-111111111111',
      driverId: 'u_1',
      departureCity: 'Montreal',
      destinationCity: 'Quebec',
      departureDateTime: new Date().toISOString(),
      seatsTotal: 3,
      seatsAvailable: 3,
      pricePerSeat: '20',
      description: 'A sample trajet',
      comfort: null,
      baggageAllowance: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    poolQuery.mockResolvedValue({ rows: [expectedRow] });

    const res = await trajetModule.request('/trajets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        departureCity: 'Montreal',
        destinationCity: 'Quebec',
        departureDateTime: expectedRow.departureDateTime,
        seatsTotal: 3,
        pricePerSeat: 20,
        description: 'A sample trajet',
      }),
    });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      ...expectedRow,
      pricePerSeat: 20,
    });
  });
});
