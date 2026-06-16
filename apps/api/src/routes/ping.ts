import { createRoute, z } from '@hono/zod-openapi';
import { PingResponseSchema } from '@carpool/schemas';

/**
 * GET /health — liveness probe. Not part of the OpenAPI contract spine, but
 * defined the same way so the RPC client can call it too.
 */
export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['system'],
  summary: 'Liveness probe',
  responses: {
    200: {
      description: 'Service is up',
      content: {
        'application/json': {
          schema: z.object({ status: z.literal('ok') }),
        },
      },
    },
  },
});

/**
 * GET /ping — the contract-spine endpoint. Its response is validated against
 * the shared `PingResponseSchema` from `@carpool/schemas`, and that same type
 * is what the RPC client and both UIs consume.
 */
export const pingRoute = createRoute({
  method: 'get',
  path: '/ping',
  tags: ['system'],
  summary: 'Ping the API and get a typed PingResponse',
  responses: {
    200: {
      description: 'Pong',
      content: {
        'application/json': {
          schema: PingResponseSchema,
        },
      },
    },
  },
});
