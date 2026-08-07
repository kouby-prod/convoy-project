import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hermetic: stub `db.update(...).set(...).where(...)` so no real database is
 * needed, and stub `global.fetch` so no real Nominatim call is made — these
 * tests exercise geocoding.ts's own logic (parsing, fallback-to-null,
 * best-effort error handling), not the live third-party API.
 */
const dbState = vi.hoisted(() => ({ updateCalls: [] as unknown[] }));
const db = vi.hoisted(() => ({
  update: vi.fn(() => ({
    set: (values: unknown) => {
      dbState.updateCalls.push(values);
      return { where: () => Promise.resolve() };
    },
  })),
}));
vi.mock('../../src/db/client', () => ({ db }));

import { geocodeCity, geocodeAndStoreTrajetLocation } from '../../src/modules/trajet/geocoding';

type FetchResult = { ok: boolean; json: () => Promise<unknown> };

function stubFetch(...responses: FetchResult[]): void {
  const fn = vi.fn();
  for (const response of responses) fn.mockResolvedValueOnce(response);
  global.fetch = fn as unknown as typeof fetch;
}

const originalFetch = global.fetch;

describe('geocodeCity', () => {
  beforeEach(() => {
    dbState.updateCalls = [];
    db.update.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns coordinates from the first matching result', async () => {
    stubFetch({ ok: true, json: async () => [{ lat: '45.5017', lon: '-73.5673' }] });

    const result = await geocodeCity('Montreal');
    expect(result).toEqual({ lat: 45.5017, lng: -73.5673 });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string | URL, RequestInit];
    expect(String(call[0])).toContain('nominatim.openstreetmap.org/search');
    expect(String(call[0])).toContain('q=Montreal');
    expect(call[1].headers).toMatchObject({ 'User-Agent': expect.stringContaining('CAN-VOITURAGE') });
  });

  it('returns null when there are no results', async () => {
    stubFetch({ ok: true, json: async () => [] });
    await expect(geocodeCity('Nowhereville')).resolves.toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    stubFetch({ ok: false, json: async () => [] });
    await expect(geocodeCity('Montreal')).resolves.toBeNull();
  });

  it('returns null and does not throw on a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(geocodeCity('Montreal')).resolves.toBeNull();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('geocodeAndStoreTrajetLocation', () => {
  beforeEach(() => {
    dbState.updateCalls = [];
    db.update.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('stores both coordinates when both cities geocode successfully', async () => {
    stubFetch(
      { ok: true, json: async () => [{ lat: '45.5', lon: '-73.5' }] },
      { ok: true, json: async () => [{ lat: '46.8', lon: '-71.2' }] },
    );

    await geocodeAndStoreTrajetLocation('trip_1', 'Montreal', 'Quebec');

    expect(dbState.updateCalls).toEqual([
      { departureLat: '45.5', departureLng: '-73.5', arrivalLat: '46.8', arrivalLng: '-71.2' },
    ]);
  });

  it('stores a null pair for whichever city fails to geocode, without throwing', async () => {
    stubFetch({ ok: true, json: async () => [{ lat: '45.5', lon: '-73.5' }] }, { ok: false, json: async () => [] });

    await expect(geocodeAndStoreTrajetLocation('trip_1', 'Montreal', 'Nowhereville')).resolves.toBeUndefined();

    expect(dbState.updateCalls).toEqual([
      { departureLat: '45.5', departureLng: '-73.5', arrivalLat: null, arrivalLng: null },
    ]);
  });
});
