import { createRoute, z } from '@hono/zod-openapi';
import {
  NotificationPageSchema,
  NotificationSchema,
  UnreadCountSchema,
  MarkAllReadResponseSchema,
  NotificationPreferenceSchema,
  UpdateNotificationPreferenceSchema,
} from '@carpool/schemas';

const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

export const listNotificationsRoute = createRoute({
  method: 'get',
  path: '/notifications',
  tags: ['notification'],
  summary: "List the authenticated user's notifications",
  security: bearerAuth,
  request: {
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      unreadOnly: z.enum(['true', 'false']).optional(),
    }),
  },
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

export const unreadNotificationCountRoute = createRoute({
  method: 'get',
  path: '/notifications/unread-count',
  tags: ['notification'],
  summary: "Count the authenticated user's unread notifications",
  security: bearerAuth,
  responses: {
    200: {
      description: 'Unread notification count',
      content: { 'application/json': { schema: UnreadCountSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const markAllNotificationsReadRoute = createRoute({
  method: 'patch',
  path: '/notifications/read-all',
  tags: ['notification'],
  summary: "Mark all of the authenticated user's unread notifications as read",
  security: bearerAuth,
  responses: {
    200: {
      description: 'Number of notifications marked as read',
      content: { 'application/json': { schema: MarkAllReadResponseSchema } },
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

export const getNotificationPreferenceRoute = createRoute({
  method: 'get',
  path: '/notifications/preferences',
  tags: ['notification'],
  summary: "Get the authenticated user's notification channel preferences",
  security: bearerAuth,
  responses: {
    200: {
      description: 'Channel preferences (defaults to both on when no row exists)',
      content: { 'application/json': { schema: NotificationPreferenceSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const putNotificationPreferenceRoute = createRoute({
  method: 'put',
  path: '/notifications/preferences',
  tags: ['notification'],
  summary: "Update the authenticated user's notification channel preferences",
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: UpdateNotificationPreferenceSchema } } },
  },
  responses: {
    200: {
      description: 'Saved preferences',
      content: { 'application/json': { schema: NotificationPreferenceSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
