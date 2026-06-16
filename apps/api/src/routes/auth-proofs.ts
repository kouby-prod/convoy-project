import { createRoute, z } from '@hono/zod-openapi';

// Bearer-token security scheme, referenced by the proof routes so Swagger shows
// an "Authorize" button. Cookie sessions also work (sent automatically).
const bearerAuth = [{ Bearer: [] }];

/** Subset of the authenticated user we expose from /me (no secrets). */
export const MeResponseSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    emailVerified: z.boolean(),
    role: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    phoneNumberVerified: z.boolean().nullable(),
  })
  .describe('Me');

/**
 * GET /me — PROOF route (not domain logic). Requires authentication; returns
 * the current user. 401 if unauthenticated.
 */
export const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['auth-proof'],
  summary: 'Current authenticated user (proof route)',
  security: bearerAuth,
  responses: {
    200: {
      description: 'The authenticated user',
      content: { 'application/json': { schema: MeResponseSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
});

/**
 * GET /admin/health — PROOF route (not domain logic). Requires the `admin`
 * role. 401 if unauthenticated, 403 if authenticated but not an admin.
 */
export const adminHealthRoute = createRoute({
  method: 'get',
  path: '/admin/health',
  tags: ['auth-proof'],
  summary: 'Admin-only health check (proof route)',
  security: bearerAuth,
  responses: {
    200: {
      description: 'Admin access granted',
      content: {
        'application/json': {
          schema: z.object({ status: z.literal('ok'), scope: z.literal('admin') }),
        },
      },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
});
