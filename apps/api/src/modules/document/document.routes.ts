import { createRoute, z } from '@hono/zod-openapi';
import {
  CreateDocumentSchema,
  DocumentFileUrlSchema,
  DocumentUploadUrlRequestSchema,
  DocumentUploadUrlSchema,
  DriverDocumentListSchema,
  DriverDocumentSchema,
} from '@carpool/schemas';

// Bearer scheme for the authed routes (cookie sessions work too). Mirrors
// apps/api/src/routes/auth-proofs.ts.
const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

/**
 * Step 1 of the upload handshake. Nothing is persisted here — the caller gets a
 * short-lived PUT URL and the key to quote back once the bytes have landed.
 */
export const createUploadUrlRoute = createRoute({
  method: 'post',
  path: '/documents/upload-url',
  tags: ['document'],
  summary: 'Get a presigned URL to upload a document',
  description:
    'Returns a short-lived PUT URL. Upload the raw file to it from the client, ' +
    'then call POST /documents with the same storageKey to record the submission.',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: DocumentUploadUrlRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Presigned upload URL',
      content: { 'application/json': { schema: DocumentUploadUrlSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

/**
 * Step 3. Verifies the object really is in the bucket before creating the row,
 * so a queue entry never points at a file that was never uploaded.
 */
export const createDocumentRoute = createRoute({
  method: 'post',
  path: '/documents',
  tags: ['document'],
  summary: 'Submit an uploaded document for review',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: CreateDocumentSchema } } },
  },
  responses: {
    201: {
      description: 'Submission recorded, awaiting review',
      content: { 'application/json': { schema: DriverDocumentSchema } },
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

/** The driver's own submissions — newest first. */
export const listMyDocumentsRoute = createRoute({
  method: 'get',
  path: '/documents/me',
  tags: ['document'],
  summary: "List the signed-in driver's documents",
  security: bearerAuth,
  responses: {
    200: {
      description: 'The documents this driver has submitted',
      content: { 'application/json': { schema: DriverDocumentListSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

/**
 * A fresh signed URL for one document. Readable by its owner or by any admin —
 * which is what lets the backoffice display the file it is reviewing.
 */
export const getDocumentFileRoute = createRoute({
  method: 'get',
  path: '/documents/{id}/file',
  tags: ['document'],
  summary: 'Get a short-lived URL to view a document',
  security: bearerAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: 'Signed view URL',
      content: { 'application/json': { schema: DocumentFileUrlSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not your document, and not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
