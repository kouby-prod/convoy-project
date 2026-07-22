import { createRoute, z } from '@hono/zod-openapi';

export const listTrajetsRoute = createRoute({
  method: 'get',
  path: '/trajets',
  tags: ['trajet'],
  summary: 'Search and list trajets',
  parameters: [
    { name: 'departureCity', in: 'query', required: false, schema: { type: 'string' } },
    { name: 'arrivalCity', in: 'query', required: false, schema: { type: 'string' } },
    { name: 'date', in: 'query', required: false, schema: { type: 'string', format: 'date' } },
    { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
    { name: 'offset', in: 'query', required: false, schema: { type: 'integer' } },
  ],
  responses: {
    200: {
      description: 'List of trajets',
      content: { 'application/json': { schema: z.array(z.any()) } },
    },
  },
});

export const createTrajetRoute = createRoute({
  method: 'post',
  path: '/trajets',
  tags: ['trajet'],
  summary: 'Create a new trajet (driver)',
  security: [{ Bearer: [] }],
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: z.object({ id: z.string() }) } } },
    400: { description: 'Bad request' },
  },
});

export const getTrajetRoute = createRoute({
  method: 'get',
  path: '/trajets/:id',
  tags: ['trajet'],
  summary: 'Get a trajet by id',
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  responses: { 200: { description: 'Trajet', content: { 'application/json': { schema: z.any() } } }, 404: { description: 'Not found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } } },
});

export const bookTrajetRoute = createRoute({
  method: 'post',
  path: '/trajets/:id/book',
  tags: ['trajet'],
  summary: 'Book seats on a trajet',
  security: [{ Bearer: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  responses: { 
    201: { description: 'Booking created', content: { 'application/json': { schema: z.object({ id: z.string() }) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    400: { description: 'Bad request', content: { 'application/json': { schema: z.object({ error: z.string().optional() }) } } },
  },
});
