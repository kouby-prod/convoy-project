import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoute, pingRoute, readyRoute, checkReady } from './routes/ping';
import { adminHealthRoute, meRoute } from './routes/auth-proofs';
import { trajetModule } from './modules/trajet';
import { geocodeModule } from './modules/geocode';
import { trackingModule } from './modules/tracking';
import { documentModule } from './modules/document';
import { vehicleModule } from './modules/vehicle';
import { adminModule } from './modules/admin';
import { reviewModule } from './modules/review';
import { messageModule } from './modules/message';
import { contactModule } from './modules/contact';
import { notificationModule } from './modules/notification';
import { avatarModule } from './modules/avatar';
import { accountDeletionModule } from './modules/account-deletion';
import { paymentModule } from './modules/payment';
import { stripeWebhookHandler, paypalWebhookHandler } from './modules/payment/webhooks';
import { auth, requireAuth, requireRole, getAuth, type AuthEnv } from './auth';
import { env } from './env';
import { messagesWebSocketHandler } from './realtime/messages-ws';
import { notificationsWebSocketHandler } from './realtime/notifications-ws';
import { locationWebSocketHandler } from './realtime/location-ws';
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
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
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

// PSP webhooks — raw body, unsigned by us, verified with provider signatures.
// Mounted outside the OpenAPI JSON chain so Hono does not parse the payload.
app.post('/webhooks/stripe', stripeWebhookHandler);
app.post('/webhooks/paypal', paypalWebhookHandler);

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
  .openapi(readyRoute, async (c) => {
    const deps = await checkReady();
    if (deps.postgres === 'ok' && deps.redis === 'ok') {
      return c.json({ status: 'ok' as const, postgres: 'ok' as const, redis: 'ok' as const }, 200);
    }
    return c.json(
      { status: 'error' as const, postgres: deps.postgres, redis: deps.redis },
      503,
    );
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
  .route('/', trajetModule)
  // --- GEOCODE routes (place search/reverse-geocode for the location picker) ---
  .route('/', geocodeModule)
  // --- TRACKING routes (live driver position for an in-progress trip) ---
  .route('/', trackingModule)
  // --- DOCUMENT domain routes (a driver's own submissions) ---
  .route('/', documentModule)
  // --- VEHICLE domain routes (a driver's own car description) ---
  .route('/', vehicleModule)
  // --- ADMIN backoffice routes (review queue, stats, accounts) ---
  .route('/', adminModule)
  // --- REVIEW domain routes ---
  .route('/', reviewModule)
  // --- MESSAGE domain routes ---
  .route('/', messageModule)
  // --- NOTIFICATION domain routes ---
  .route('/', notificationModule)
  .route('/', avatarModule)
  .route('/', accountDeletionModule)
  // --- CONTACT domain routes ---
  .route('/', contactModule)
  // --- PAYMENT / INVOICE domain routes ---
  .route('/', paymentModule)
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

// ---------------------------------------------------------------------------
// WebSocket — live booking threads. Mounted on `app` (not the `routes` chain)
// so it does not pollute the typed RPC client; history stays on REST.
// Prefer cookie session (same-site / credentialed). Optional `?token=` bearer
// is for native/cross-origin clients that cannot send cookies on upgrade.
// After connect: `{ type: "subscribe", bookingId }`.
// ---------------------------------------------------------------------------
app.get('/ws/messages', messagesWebSocketHandler);

// ---------------------------------------------------------------------------
// WebSocket — live notification delivery. Same rationale as `/ws/messages`
// above: kept off the `routes` chain so it doesn't pollute the typed RPC
// client. No subscribe frame — a user's socket receives all of their own
// notifications once the `ready` frame arrives.
// ---------------------------------------------------------------------------
app.get('/ws/notifications', notificationsWebSocketHandler);

// ---------------------------------------------------------------------------
// WebSocket — live driver position for an in-progress trip. Same rationale as
// `/ws/messages` above. After connect: `{ type: "subscribe", trajetId }`.
// ---------------------------------------------------------------------------
app.get('/ws/location', locationWebSocketHandler);

// ---------------------------------------------------------------------------
// PROOF helper (dev only): one-click "Continue with Google" page to exercise
// the web redirect flow without a full client. Registered only when Google is
// configured AND the deployment is non-HTTPS (i.e. a local/dev URL such as
// http://localhost, including the production-built Docker image run locally).
// A real HTTPS deployment never exposes it. After consent the browser is sent
// to /me, which renders the user from the session cookie. Not domain logic.
// ---------------------------------------------------------------------------
const isLocalHttp = !env.BETTER_AUTH_URL.startsWith('https://');
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && isLocalHttp) {
  app.get('/google-demo', (c) => {
    return c.html(`<!doctype html>
<html><head><meta charset="utf-8"><title>Google sign-in (dev proof)</title></head>
<body style="font-family:system-ui;max-width:32rem;margin:3rem auto">
  <h1>Google sign-in — dev proof</h1>
  <p>Clicks <code>POST /api/auth/sign-in/social</code> then follows the redirect.
     After consent you land on <code>/me</code>.</p>
  <button id="g" style="padding:.6rem 1rem;font-size:1rem;cursor:pointer">Continue with Google</button>
  <pre id="out" style="color:#b00"></pre>
  <script>
    document.getElementById('g').onclick = async () => {
      const res = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          callbackURL: location.origin + '/me',
          errorCallbackURL: location.origin + '/google-demo',
        }),
      });
      const data = await res.json();
      if (data.url) location.href = data.url;
      else document.getElementById('out').textContent = JSON.stringify(data, null, 2);
    };
  </script>
</body></html>`);
  });
}

export { app };

/**
 * The exported app type the RPC client (`@carpool/api-client`) binds to.
 * This is the type half of the contract spine.
 */
export type AppType = typeof routes;
