import { createRoute, z } from '@hono/zod-openapi';
import {
  TrajetSchema,
  TrajetListSchema,
  CreateTrajetSchema,
} from '@carpool/schemas';

// Bearer scheme for the authed routes (cookie sessions work too). Mirrors
// apps/api/src/routes/auth-proofs.ts.
const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

export const listTrajetsRoute = createRoute({
  method: 'get',
  path: '/trajets',
  tags: ['trajet'],
  summary: 'List trajets',
  responses: {
    200: {
      description: 'List of trajets',
      content: { 'application/json': { schema: TrajetListSchema } },
    },
  },
});

export const getTrajetRoute = createRoute({
  method: 'get',
  path: '/trajets/{id}',
  tags: ['trajet'],
  summary: 'Get a single trajet by id',
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: 'The trajet',
      content: { 'application/json': { schema: TrajetSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const createTrajetRoute = createRoute({
  method: 'post',
  path: '/trajets',
  tags: ['trajet'],
  summary: 'Create a trajet',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: CreateTrajetSchema } } },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: TrajetSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
