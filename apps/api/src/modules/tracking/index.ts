import { OpenAPIHono } from '@hono/zod-openapi';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { rateLimit } from '../../middleware/rate-limit';
import { resolveTrajetLocationAccess } from './access';
import { setLiveLocation, getLiveLocation, clearLiveLocation } from './store';
import { publishLocationUpdated, publishLocationStopped } from './events';
import {
  updateLiveLocationRoute,
  getLiveLocationRoute,
  stopLiveLocationRoute,
} from './tracking.routes';

/**
 * Tracking module — an `OpenAPIHono` sub-app mounted by app.ts (see
 * apps/api/src/modules/README.md). It is exported as the CHAINED result of
 * `.openapi(...)` so its route types flow into `AppType` (the RPC client and
 * Swagger).
 *
 * No table: the latest position lives in Redis with a TTL (see ./store.ts) —
 * a live map has no use for history, and durable storage would just add
 * write amplification for a value that changes every few seconds. Real-time
 * delivery is a direct Redis publish after each successful ping (no BullMQ
 * queue, unlike messages): losing one ping to a Redis blip is fine, the next
 * one arrives in a few seconds anyway. Clients connect to `GET /ws/location`
 * (see realtime/location-ws.ts).
 */
const app = new OpenAPIHono<AuthEnv>();
app.use('/trajets/:id/location', requireAuth);

// A driver pings roughly every 8-10s while sharing (see
// apps/web/src/hooks/use-live-location-share.ts) — generous enough for
// normal use, tight enough to blunt a runaway or malicious client. Rate
// limited by user id, so it must run after requireAuth above.
const locationPingLimit = rateLimit<AuthEnv>({
  windowSeconds: 60,
  max: 30,
  keyGenerator: (c) => getAuth(c).user.id,
});
app.use('/trajets/:id/location', async (c, next) =>
  c.req.method === 'POST' ? locationPingLimit(c, next) : next(),
);

export const trackingModule = app
  .openapi(updateLiveLocationRoute, async (c) => {
    const { user } = getAuth(c);
    const { id: trajetId } = c.req.valid('param');

    const access = await resolveTrajetLocationAccess(trajetId, user.id);
    if (!access.ok) return c.json({ error: access.error }, access.status);
    if (!access.isDriver) return c.json({ error: 'Only the driver can publish a position' }, 403);

    const body = c.req.valid('json');
    const location = {
      trajetId,
      lat: body.lat,
      lng: body.lng,
      heading: body.heading ?? null,
      speed: body.speed ?? null,
      updatedAt: new Date().toISOString(),
    };

    await setLiveLocation(location);
    try {
      await publishLocationUpdated(location);
    } catch (err) {
      console.error(`Failed to publish location update for trajet ${trajetId}`, err);
    }

    return c.json(location, 200);
  })
  .openapi(getLiveLocationRoute, async (c) => {
    const { user } = getAuth(c);
    const { id: trajetId } = c.req.valid('param');

    const access = await resolveTrajetLocationAccess(trajetId, user.id);
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const location = await getLiveLocation(trajetId);
    return c.json({ location }, 200);
  })
  .openapi(stopLiveLocationRoute, async (c) => {
    const { user } = getAuth(c);
    const { id: trajetId } = c.req.valid('param');

    const access = await resolveTrajetLocationAccess(trajetId, user.id);
    if (!access.ok) return c.json({ error: access.error }, access.status);
    if (!access.isDriver) return c.json({ error: 'Only the driver can stop sharing a position' }, 403);

    await clearLiveLocation(trajetId);
    try {
      await publishLocationStopped(trajetId);
    } catch (err) {
      console.error(`Failed to publish location stop for trajet ${trajetId}`, err);
    }

    return c.body(null, 204);
  });
