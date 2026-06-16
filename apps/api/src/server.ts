import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './env';

// Boot. `env` is validated at import time and will exit(1) on bad config.
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
  console.log(`[api] Swagger UI:  http://localhost:${info.port}/docs`);
  console.log(`[api] OpenAPI doc: http://localhost:${info.port}/openapi.json`);
});
