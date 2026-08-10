import { createRoute, z } from '@hono/zod-openapi';
import {
  MessageSchema,
  MessagePageSchema,
  CreateMessageSchema,
  ConversationPageSchema,
  PaginationQuerySchema,
} from '@carpool/schemas';

// Bearer scheme for the authed routes (cookie sessions work too). Mirrors
// apps/api/src/routes/auth-proofs.ts.
const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

export const listConversationsRoute = createRoute({
  method: 'get',
  path: '/messages/conversations',
  tags: ['message'],
  summary:
    'List booking threads the current user can access (as passenger or driver), newest last-message first',
  security: bearerAuth,
  request: {
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'A page of conversations',
      content: { 'application/json': { schema: ConversationPageSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const listBookingMessagesRoute = createRoute({
  method: 'get',
  path: '/bookings/{bookingId}/messages',
  tags: ['message'],
  summary: "List a booking's messages, oldest first (the booking's passenger or the trajet's driver only)",
  security: bearerAuth,
  request: {
    params: z.object({ bookingId: z.string().uuid() }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'A page of messages',
      content: { 'application/json': { schema: MessagePageSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Neither the passenger nor the driver of this booking',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Booking not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const createBookingMessageRoute = createRoute({
  method: 'post',
  path: '/bookings/{bookingId}/messages',
  tags: ['message'],
  summary: "Post a message on a booking's thread (the booking's passenger or the trajet's driver only)",
  security: bearerAuth,
  request: {
    params: z.object({ bookingId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: CreateMessageSchema } } },
  },
  responses: {
    201: {
      description: 'Message posted',
      content: { 'application/json': { schema: MessageSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Neither the passenger nor the driver of this booking',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Booking not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
