import { createRoute, z } from '@hono/zod-openapi';
import { AccountDeletionStatusSchema, ScheduleAccountDeletionSchema } from '@carpool/schemas';

const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

export const getAccountDeletionRoute = createRoute({
  method: 'get',
  path: '/account/deletion',
  tags: ['account'],
  summary: 'Whether the signed-in account is in the 30-day deletion hold',
  security: bearerAuth,
  responses: {
    200: {
      description: 'Deletion hold status',
      content: { 'application/json': { schema: AccountDeletionStatusSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const scheduleAccountDeletionRoute = createRoute({
  method: 'post',
  path: '/account/deletion',
  tags: ['account'],
  summary: 'Schedule account deletion in 30 days (password when the account has one)',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: ScheduleAccountDeletionSchema } } },
  },
  responses: {
    200: {
      description: 'Hold started',
      content: { 'application/json': { schema: AccountDeletionStatusSchema } },
    },
    400: {
      description: 'Password missing or incorrect',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    409: {
      description: 'Deletion is already scheduled',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const cancelAccountDeletionRoute = createRoute({
  method: 'delete',
  path: '/account/deletion',
  tags: ['account'],
  summary: 'Cancel a pending account deletion',
  security: bearerAuth,
  responses: {
    200: {
      description: 'Hold lifted',
      content: { 'application/json': { schema: AccountDeletionStatusSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'No deletion is scheduled',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
