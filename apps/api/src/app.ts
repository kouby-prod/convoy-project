import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoute, pingRoute } from './routes/ping';
import { adminHealthRoute, meRoute } from './routes/auth-proofs';
import { listTrajetsRoute, createTrajetRoute, getTrajetRoute, bookTrajetRoute } from './trajet/routes';
import * as trajetService from './trajet/service';
import { auth, requireAuth, requireRole, getAuth, type AuthEnv } from './auth';
import { env } from './env';
// TODO: domain modules — mount feature routers from ./modules here.
// import { rideRoutes } from './modules/rides';

const app = new OpenAPIHono<AuthEnv>();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use('*', logger());

// CORS — credentialed, restricted to trusted origins (cookie sessions need a
// specific origin, not "*"). `set-auth-token` is exposed so bearer clients can
// read their token from the sign-in response. Registered before routes.
app.use(
  '*',
  cors({
    origin: env.TRUSTED_ORIGINS,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['set-auth-token'],
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// BetterAuth handler — mounts sign-up/in, email verification, password reset,
// phone OTP, admin and bearer endpoints under /api/auth/*. BetterAuth owns
// password hashing, token signing, sessions, CSRF and rate limiting.
// ---------------------------------------------------------------------------
app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// ---------------------------------------------------------------------------
// Auth middleware for the proof routes (attached before the OpenAPI handlers).
// ---------------------------------------------------------------------------
app.use('/me', requireAuth);
app.use('/admin/health', requireAuth, requireRole('admin'));

// ---------------------------------------------------------------------------
// Routes — one chained expression so the resulting type carries every route.
// `AppType` (below) is what the RPC client binds to for full inference.
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
  })
  // --- TRAJET domain routes ---
  .openapi(listTrajetsRoute, async (c) => {
    const q = c.req.query();
    const limit = q.limit ? Number(q.limit) : 20;
    const offset = q.offset ? Number(q.offset) : 0;
    const rows = await trajetService.searchTrajets({
      departureCity: q.departureCity,
      arrivalCity: q.arrivalCity,
      date: q.date,
      limit,
      offset,
    });
    return c.json(rows, 200);
  })
  .openapi(createTrajetRoute, async (c) => {
    // auth required
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json();
    try {
      const { id } = await trajetService.createTrajet(session.user.id, body);
      return c.json({ id }, 201);
    } catch (err: any) {
      return c.json({ error: err.message ?? 'Failed' }, 400);
    }
  })
  .openapi(getTrajetRoute, async (c) => {
    const id = c.req.param('id')!;
    const row = await trajetService.getTrajetById(id);
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(row, 200);
  })
  .openapi(bookTrajetRoute, async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    const id = c.req.param('id')!;
    const body = await c.req.json();
    try {
      const result = await trajetService.bookSeats(id, session.user.id, body.seats);
      return c.json(result, 201);
    } catch (err: any) {
      return c.json({ error: err.message ?? 'Booking failed' }, 400);
    }
  })
  // --- PROOF routes (not domain logic) ---
  .openapi(meRoute, (c) => {
    const { user } = getAuth(c);
    return c.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        role: user.role ?? null,
        phoneNumber: user.phoneNumber ?? null,
        phoneNumberVerified: user.phoneNumberVerified ?? null,
      },
      200,
    );
  })
  .openapi(adminHealthRoute, (c) => {
    return c.json({ status: 'ok' as const, scope: 'admin' as const }, 200);
  });

// ---------------------------------------------------------------------------
// OpenAPI document + Swagger UI
// ---------------------------------------------------------------------------
app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http',
  scheme: 'bearer',
  description: 'BetterAuth bearer token (from the `set-auth-token` header on sign-in).',
});

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Carpool API',
    version: '0.0.0',
    description:
      'Carpool API. Auth is handled by BetterAuth under /api/auth/*. ' +
      '/me and /admin/health are throwaway proof routes for the auth wiring.',
  },
});

app.get('/docs', swaggerUI({ url: '/openapi.json' }));

export { app };

/**
 * The exported app type the RPC client (`@carpool/api-client`) binds to.
 * This is the type half of the contract spine.
 */
export type AppType = typeof routes;
