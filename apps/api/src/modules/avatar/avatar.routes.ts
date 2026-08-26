import { createRoute, z } from '@hono/zod-openapi';
import {
  ConfirmVehiclePhotoSchema,
  VehiclePhotoUploadUrlRequestSchema,
  VehiclePhotoUploadUrlSchema,
  VehiclePhotoUrlSchema,
} from '@carpool/schemas';

const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

export const createAvatarUploadUrlRoute = createRoute({
  method: 'post',
  path: '/avatars/me/upload-url',
  tags: ['avatar'],
  summary: 'Get a presigned URL to upload a profile photo',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: VehiclePhotoUploadUrlRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Presigned upload URL',
      content: { 'application/json': { schema: VehiclePhotoUploadUrlSchema } },
    },
    400: {
      description: 'Unsupported file type',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const putMyAvatarRoute = createRoute({
  method: 'put',
  path: '/avatars/me',
  tags: ['avatar'],
  summary: 'Attach an uploaded profile photo to the signed-in user',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: ConfirmVehiclePhotoSchema } } },
  },
  responses: {
    200: {
      description: 'Photo attached',
      content: { 'application/json': { schema: VehiclePhotoUrlSchema } },
    },
    400: {
      description: 'The upload is unknown or never completed',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const getAvatarRoute = createRoute({
  method: 'get',
  path: '/avatars/{userId}',
  tags: ['avatar'],
  summary: 'Get a short-lived URL to view a profile photo',
  request: { params: z.object({ userId: z.string().min(1) }) },
  responses: {
    200: {
      description: 'View URL (signed S3 or a remote HTTPS avatar)',
      content: { 'application/json': { schema: VehiclePhotoUrlSchema } },
    },
    404: {
      description: 'No photo on file',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
