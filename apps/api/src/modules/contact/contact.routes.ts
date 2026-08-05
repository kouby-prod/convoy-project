import { createRoute, z } from '@hono/zod-openapi';
import { CreateContactMessageSchema, ContactMessageSentSchema } from '@carpool/schemas';

const errorSchema = z.object({ error: z.string() });

// Enforced by the rate-limit middleware in apps/api/src/modules/contact/index.ts
// (not the route handler), but documented here like any other response.
const rateLimitedResponse = {
  description: 'Too many requests — see the Retry-After header',
  content: { 'application/json': { schema: errorSchema } },
};

export const createContactMessageRoute = createRoute({
  method: 'post',
  path: '/contact',
  tags: ['contact'],
  summary: 'Send a message to customer support — public, no session required',
  request: {
    body: { content: { 'application/json': { schema: CreateContactMessageSchema } } },
  },
  responses: {
    200: {
      description: 'Message forwarded to support',
      content: { 'application/json': { schema: ContactMessageSentSchema } },
    },
    429: rateLimitedResponse,
    502: {
      description: 'Failed to send the message — try again later',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
