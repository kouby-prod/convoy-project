import { createRoute, z } from '@hono/zod-openapi';
import { LiveLocationResponseSchema, LiveLocationSchema, UpdateLiveLocationSchema } from '@carpool/schemas';

const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });
const paramsSchema = z.object({ id: z.string().uuid() });

export const updateLiveLocationRoute = createRoute({
  method: 'post',
  path: '/trajets/{id}/location',
  tags: ['tracking'],
  summary: "Publish the driver's current position for this trajet — driver only",
  security: bearerAuth,
  request: {
    params: paramsSchema,
    body: { content: { 'application/json': { schema: UpdateLiveLocationSchema } } },
  },
  responses: {
    200: {
      description: 'Stored position',
      content: { 'application/json': { schema: LiveLocationSchema } },
    },
    401: { description: 'Not authenticated', content: { 'application/json': { schema: errorSchema } } },
    403: {
      description: 'Not the driver of this trajet',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: { description: 'Trajet not found', content: { 'application/json': { schema: errorSchema } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: errorSchema } } },
  },
});

export const getLiveLocationRoute = createRoute({
  method: 'get',
  path: '/trajets/{id}/location',
  tags: ['tracking'],
  summary: "Get the driver's last known position — the driver or a confirmed passenger",
  security: bearerAuth,
  request: { params: paramsSchema },
  responses: {
    200: {
      description: 'Latest position, or null when nobody is currently sharing',
      content: { 'application/json': { schema: LiveLocationResponseSchema } },
    },
    401: { description: 'Not authenticated', content: { 'application/json': { schema: errorSchema } } },
    403: {
      description: 'Not authorized for this trajet',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: { description: 'Trajet not found', content: { 'application/json': { schema: errorSchema } } },
  },
});

export const stopLiveLocationRoute = createRoute({
  method: 'delete',
  path: '/trajets/{id}/location',
  tags: ['tracking'],
  summary: 'Stop sharing the position for this trajet — driver only',
  security: bearerAuth,
  request: { params: paramsSchema },
  responses: {
    204: { description: 'Stopped' },
    401: { description: 'Not authenticated', content: { 'application/json': { schema: errorSchema } } },
    403: {
      description: 'Not the driver of this trajet',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: { description: 'Trajet not found', content: { 'application/json': { schema: errorSchema } } },
  },
});
