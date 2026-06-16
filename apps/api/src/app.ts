import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoute, pingRoute } from './routes/ping';
// TODO: domain modules — mount feature routers from ./modules here.
// import { rideRoutes } from './modules/rides';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Middleware slot
// ---------------------------------------------------------------------------
// Global middleware goes here. CORS + request logging are wired so the web and
// mobile clients can reach the API during local development.
//
// TODO: add auth, rate limiting, request-id, etc. when those land. None of
//       that is part of the base skeleton.
app.use('*', logger());
app.use('*', cors());

// ---------------------------------------------------------------------------
// Routes — defined as one chained expression so the resulting type carries
// every route. `AppType` (below) is what the RPC client binds to for full
// end-to-end inference.
// ---------------------------------------------------------------------------
// `routes` is consumed below by `typeof routes` to build AppType.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const routes = app
  .openapi(healthRoute, (c) => {
    return c.json({ status: 'ok' as const }, 200);
  })
  .openapi(pingRoute, (c) => {
    return c.json(
      {
        message: 'pong',
        timestamp: new Date().toISOString(),
      },
      200,
    );
  });

// ---------------------------------------------------------------------------
// OpenAPI document + Swagger UI
// ---------------------------------------------------------------------------
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Carpool API',
    version: '0.0.0',
    description: 'Base skeleton API — only system endpoints exist so far.',
  },
});

app.get('/docs', swaggerUI({ url: '/openapi.json' }));

export { app };

/**
 * The exported app type the RPC client (`@carpool/api-client`) binds to.
 * This is the type half of the contract spine.
 */
export type AppType = typeof routes;
