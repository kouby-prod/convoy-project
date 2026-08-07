import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './env';
import { ensureBucket } from './storage/s3';

// Create the documents bucket if it is missing, so a fresh `docker compose up`
// with an empty MinIO volume is usable without a manual step in the console.
// Non-fatal: everything except document upload works without object storage,
// and failing to boot the whole API over it would be the wrong trade.
await ensureBucket().catch((error: unknown) => {
  console.error('[storage] bucket unavailable — document upload will fail:', error);
});

// Boot. `env` is validated at import time and will exit(1) on bad config.
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
  console.log(`[api] Swagger UI:  http://localhost:${info.port}/docs`);
  console.log(`[api] OpenAPI doc: http://localhost:${info.port}/openapi.json`);
});
