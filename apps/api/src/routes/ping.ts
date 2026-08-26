import { createRoute, z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import { PingResponseSchema } from '@carpool/schemas';
import { db } from '../db/client';
import { createRedisConnection } from '../queue/redis';
import type Redis from 'ioredis';

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

export const readyRoute = createRoute({
  method: 'get',
  path: '/ready',
  tags: ['system'],
  summary: 'Readiness probe — Postgres and Redis',
  responses: {
    200: {
      description: 'Dependencies are reachable',
      content: {
        'application/json': {
          schema: z.object({
            status: z.literal('ok'),
            postgres: z.literal('ok'),
            redis: z.literal('ok'),
          }),
        },
      },
    },
    503: {
      description: 'A dependency is down',
      content: {
        'application/json': {
          schema: z.object({
            status: z.literal('error'),
            postgres: z.enum(['ok', 'error']),
            redis: z.enum(['ok', 'error']),
          }),
        },
      },
    },
  },
});

let readyRedis: Redis | undefined;

export async function checkReady(): Promise<{ postgres: 'ok' | 'error'; redis: 'ok' | 'error' }> {
  let postgres: 'ok' | 'error' = 'error';
  let redisStatus: 'ok' | 'error' = 'error';
  try {
    await db.execute(sql`select 1`);
    postgres = 'ok';
  } catch (err) {
    console.error('[ready] postgres', err);
  }
  try {
    if (!readyRedis) readyRedis = createRedisConnection('ready');
    const pong = await readyRedis.ping();
    if (pong === 'PONG' || pong === 'pong') redisStatus = 'ok';
  } catch (err) {
    console.error('[ready] redis', err);
  }
  return { postgres, redis: redisStatus };
}

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
