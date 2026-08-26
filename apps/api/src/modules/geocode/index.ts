import { OpenAPIHono } from '@hono/zod-openapi';
import type { AuthEnv } from '../../auth';
import { rateLimit } from '../../middleware/rate-limit';
import { searchPlaces, reverseGeocode } from '../trajet/geocoding';
import { searchGeocodeRoute, reverseGeocodeRoute } from './geocode.routes';

/**
 * Geocode module — an `OpenAPIHono` sub-app mounted by app.ts (see
 * apps/api/src/modules/README.md). It is exported as the CHAINED result of
 * `.openapi(...)` so its route types flow into `AppType` (the RPC client and
 * Swagger). Exporting the bare `new OpenAPIHono()` would drop the route types
 * and `api.geocode` would not exist on the typed client.
 *
 * No table: a thin, public proxy over OSM Nominatim (see
 * ../trajet/geocoding.ts, which owns the shared 1 req/sec throttle this
 * reuses) for the departure/arrival location picker on the ride-creation
 * form. There is nothing here to persist.
 */
const app = new OpenAPIHono<AuthEnv>();

// Public and unauthenticated — the shared Nominatim throttle already
// serializes every geocoding call process-wide, so a per-IP cap here mostly
// protects other callers from one client hogging that shared queue.
const geocodeRateLimit = rateLimit<AuthEnv>({ windowSeconds: 60, max: 20 });
app.use('/geocode/search', geocodeRateLimit);
app.use('/geocode/reverse', geocodeRateLimit);

export const geocodeModule = app
  .openapi(searchGeocodeRoute, async (c) => {
    const { q } = c.req.valid('query');
    const items = await searchPlaces(q);
    return c.json({ items }, 200);
  })
  .openapi(reverseGeocodeRoute, async (c) => {
    const { lat, lng } = c.req.valid('query');
    const label = await reverseGeocode(lat, lng);
    return c.json({ label }, 200);
  });
