import { createRoute, z } from '@hono/zod-openapi';
import {
  GeocodeSearchQuerySchema,
  GeocodeSearchResponseSchema,
  GeocodeReverseQuerySchema,
  GeocodeReverseResponseSchema,
} from '@carpool/schemas';

const errorSchema = z.object({ error: z.string() });

// Enforced by the rate-limit middleware in apps/api/src/modules/geocode/index.ts
// (not the route handler), but documented here like any other response.
const rateLimitedResponse = {
  description: 'Too many requests — see the Retry-After header',
  content: { 'application/json': { schema: errorSchema } },
};

export const searchGeocodeRoute = createRoute({
  method: 'get',
  path: '/geocode/search',
  tags: ['geocode'],
  summary: 'Search for a place by free text — public, no session required',
  request: {
    query: GeocodeSearchQuerySchema,
  },
  responses: {
    200: {
      description: 'Matching places',
      content: { 'application/json': { schema: GeocodeSearchResponseSchema } },
    },
    429: rateLimitedResponse,
  },
});

export const reverseGeocodeRoute = createRoute({
  method: 'get',
  path: '/geocode/reverse',
  tags: ['geocode'],
  summary: 'Resolve a coordinate pair to a human-readable label — public, no session required',
  request: {
    query: GeocodeReverseQuerySchema,
  },
  responses: {
    200: {
      description: 'Best-effort label — null when the coordinates could not be resolved',
      content: { 'application/json': { schema: GeocodeReverseResponseSchema } },
    },
    429: rateLimitedResponse,
  },
});
