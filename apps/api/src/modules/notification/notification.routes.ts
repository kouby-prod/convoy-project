import { createRoute, z } from '@hono/zod-openapi';
import { NotificationPageSchema, NotificationSchema } from '@carpool/schemas';

const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

export const listNotificationsRoute = createRoute({
  method: 'get',
  path: '/notifications',
  tags: ['notification'],
  summary: "List the authenticated user's notifications",
  security: bearerAuth,
  request: { query: z.object({ page: z.number().int().min(1).default(1), limit: z.number().int().min(1).max(50).default(20) }) },
  responses: {
    200: {
      description: 'A page of notifications',
      content: { 'application/json': { schema: NotificationPageSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const markNotificationReadRoute = createRoute({
  method: 'patch',
  path: '/notifications/{id}/read',
  tags: ['notification'],
  summary: 'Mark a notification as read',
  security: bearerAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: 'Marked as read',
      content: { 'application/json': { schema: NotificationSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Notification not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
