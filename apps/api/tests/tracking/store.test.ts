import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisState = vi.hoisted(() => ({
  store: new Map<string, string>(),
}));

const set = vi.fn(async (key: string, value: string) => {
  redisState.store.set(key, value);
  return 'OK';
});
const get = vi.fn(async (key: string) => redisState.store.get(key) ?? null);
const del = vi.fn(async (key: string) => {
  redisState.store.delete(key);
});
const quit = vi.fn();

vi.mock('../../src/queue/redis', () => ({
  createRedisConnection: () => ({ set, get, del, quit, on: vi.fn() }),
}));

import {
  setLiveLocation,
  getLiveLocation,
  clearLiveLocation,
  locationKey,
  LOCATION_TTL_SECONDS,
} from '../../src/modules/tracking/store';

const TRAJET_ID = '11111111-1111-4111-8111-111111111111';

describe('tracking store', () => {
  beforeEach(() => {
    redisState.store.clear();
    set.mockClear();
    get.mockClear();
    del.mockClear();
  });

  it('stores the location as JSON with the TTL applied', async () => {
    const location = {
      trajetId: TRAJET_ID,
      lat: 45.5,
      lng: -73.6,
      heading: 180,
      speed: 20,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    await setLiveLocation(location);

    expect(set).toHaveBeenCalledWith(
      locationKey(TRAJET_ID),
      JSON.stringify(location),
      'EX',
      LOCATION_TTL_SECONDS,
    );
  });

  it('round-trips a stored location', async () => {
    const location = {
      trajetId: TRAJET_ID,
      lat: 45.5,
      lng: -73.6,
      heading: null,
      speed: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await setLiveLocation(location);

    const result = await getLiveLocation(TRAJET_ID);

    expect(result).toEqual(location);
  });

  it('returns null when nothing has been stored', async () => {
    const result = await getLiveLocation('missing-trajet');
    expect(result).toBeNull();
  });

  it('returns null instead of throwing on corrupted JSON', async () => {
    redisState.store.set(locationKey(TRAJET_ID), 'not-json');

    const result = await getLiveLocation(TRAJET_ID);

    expect(result).toBeNull();
  });

  it('deletes the key on clear', async () => {
    await setLiveLocation({
      trajetId: TRAJET_ID,
      lat: 1,
      lng: 2,
      heading: null,
      speed: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await clearLiveLocation(TRAJET_ID);

    expect(del).toHaveBeenCalledWith(locationKey(TRAJET_ID));
    expect(await getLiveLocation(TRAJET_ID)).toBeNull();
  });
});
