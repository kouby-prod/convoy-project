import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock BetterAuth so protected routes can be exercised without real sessions.
const getSession = vi.fn();
vi.mock('../../src/auth/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

const resolveTrajetLocationAccess = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/tracking/access', () => ({
  resolveTrajetLocationAccess: (...a: unknown[]) => resolveTrajetLocationAccess(...a),
}));

const setLiveLocation = vi.hoisted(() => vi.fn());
const getLiveLocation = vi.hoisted(() => vi.fn());
const clearLiveLocation = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/tracking/store', () => ({
  setLiveLocation: (...a: unknown[]) => setLiveLocation(...a),
  getLiveLocation: (...a: unknown[]) => getLiveLocation(...a),
  clearLiveLocation: (...a: unknown[]) => clearLiveLocation(...a),
}));

const publishLocationUpdated = vi.hoisted(() => vi.fn());
const publishLocationStopped = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/tracking/events', () => ({
  publishLocationUpdated: (...a: unknown[]) => publishLocationUpdated(...a),
  publishLocationStopped: (...a: unknown[]) => publishLocationStopped(...a),
}));

import { trackingModule } from '../../src/modules/tracking';

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

const TRAJET_ID = '11111111-1111-4111-8111-111111111111';

describe('tracking module', () => {
  beforeEach(() => {
    getSession.mockReset();
    resolveTrajetLocationAccess.mockReset();
    setLiveLocation.mockReset();
    setLiveLocation.mockResolvedValue(undefined);
    getLiveLocation.mockReset();
    clearLiveLocation.mockReset();
    clearLiveLocation.mockResolvedValue(undefined);
    publishLocationUpdated.mockReset();
    publishLocationUpdated.mockResolvedValue(undefined);
    publishLocationStopped.mockReset();
    publishLocationStopped.mockResolvedValue(undefined);
  });

  describe('POST /trajets/:id/location', () => {
    const body = { lat: 45.5, lng: -73.6, heading: 90, speed: 15 };

    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(401);
    });

    it('returns the access check status when access is denied', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: false, status: 404, error: 'Trajet not found' });

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Trajet not found' });
    });

    it('returns 403 when the caller is a confirmed passenger, not the driver', async () => {
      getSession.mockResolvedValue(sessionFor('passenger_1'));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: true, isDriver: false });

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(403);
      expect(setLiveLocation).not.toHaveBeenCalled();
    });

    it('stores and publishes the position for the driver', async () => {
      getSession.mockResolvedValue(sessionFor('driver_1'));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: true, isDriver: true });

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { trajetId: string; lat: number; lng: number; updatedAt: string };
      expect(json).toMatchObject({ trajetId: TRAJET_ID, lat: 45.5, lng: -73.6, heading: 90, speed: 15 });
      expect(typeof json.updatedAt).toBe('string');

      expect(setLiveLocation).toHaveBeenCalledWith(expect.objectContaining({ trajetId: TRAJET_ID, lat: 45.5 }));
      expect(publishLocationUpdated).toHaveBeenCalledWith(expect.objectContaining({ trajetId: TRAJET_ID }));
    });

    it('defaults heading/speed to null when omitted', async () => {
      getSession.mockResolvedValue(sessionFor('driver_1'));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: true, isDriver: true });

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 45.5, lng: -73.6 }),
      });
      const json = (await res.json()) as { heading: number | null; speed: number | null };
      expect(json.heading).toBeNull();
      expect(json.speed).toBeNull();
    });

    it('still returns 200 when publishing fails (best-effort)', async () => {
      getSession.mockResolvedValue(sessionFor('driver_1'));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: true, isDriver: true });
      publishLocationUpdated.mockRejectedValue(new Error('redis down'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(200);
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('GET /trajets/:id/location', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`);
      expect(res.status).toBe(401);
    });

    it('returns the access check status when access is denied', async () => {
      getSession.mockResolvedValue(sessionFor('u_1'));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: false, status: 403, error: 'Not authorized for this trajet' });

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`);
      expect(res.status).toBe(403);
    });

    it('returns null when nobody is sharing', async () => {
      getSession.mockResolvedValue(sessionFor('driver_1'));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: true, isDriver: true });
      getLiveLocation.mockResolvedValue(null);

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ location: null });
    });

    it('returns the stored location for a confirmed passenger', async () => {
      getSession.mockResolvedValue(sessionFor('passenger_1'));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: true, isDriver: false });
      const location = {
        trajetId: TRAJET_ID,
        lat: 45.5,
        lng: -73.6,
        heading: null,
        speed: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      getLiveLocation.mockResolvedValue(location);

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ location });
    });
  });

  describe('DELETE /trajets/:id/location', () => {
    it('returns 401 without a session', async () => {
      getSession.mockResolvedValue(null);
      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`, { method: 'DELETE' });
      expect(res.status).toBe(401);
    });

    it('returns 403 when the caller is not the driver', async () => {
      getSession.mockResolvedValue(sessionFor('passenger_1'));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: true, isDriver: false });

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`, { method: 'DELETE' });
      expect(res.status).toBe(403);
      expect(clearLiveLocation).not.toHaveBeenCalled();
    });

    it('clears the position and publishes a stopped event for the driver', async () => {
      getSession.mockResolvedValue(sessionFor('driver_1'));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: true, isDriver: true });

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`, { method: 'DELETE' });
      expect(res.status).toBe(204);
      expect(clearLiveLocation).toHaveBeenCalledWith(TRAJET_ID);
      expect(publishLocationStopped).toHaveBeenCalledWith(TRAJET_ID);
    });
  });

  describe('rate limiting POST /trajets/:id/location', () => {
    // A dedicated user id: the limiter's bucket map lives for the whole test
    // file (it's created once when the module is imported), so reusing an id
    // exercised by earlier tests would make this test depend on their count.
    const RATE_LIMITED_USER = 'rate_limit_driver';

    it('allows 30 pings per minute for one caller, then rejects the 31st with 429', async () => {
      getSession.mockResolvedValue(sessionFor(RATE_LIMITED_USER));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: true, isDriver: true });

      let lastStatus = 0;
      for (let i = 0; i < 31; i += 1) {
        const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: 45.5, lng: -73.6 }),
        });
        if (i === 29) expect(res.status).toBe(200); // 30th request still allowed
        lastStatus = res.status;
      }

      expect(lastStatus).toBe(429);
    });

    it('does not rate-limit GET for the same caller under the POST limit', async () => {
      getSession.mockResolvedValue(sessionFor(RATE_LIMITED_USER));
      resolveTrajetLocationAccess.mockResolvedValue({ ok: true, isDriver: true });
      getLiveLocation.mockResolvedValue(null);

      const res = await trackingModule.request(`/trajets/${TRAJET_ID}/location`);
      expect(res.status).toBe(200);
    });
  });
});
