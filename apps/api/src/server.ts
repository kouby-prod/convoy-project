import { createRequire } from 'node:module';
import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './env';
import { messageHub } from './realtime/hub';
import { notificationHub } from './realtime/notification-hub';
import { closeMessageQueue } from './queue/message-jobs';
import { startMessageWorker, stopMessageWorker } from './queue/message-worker';
import { closeNotificationPublisher } from './modules/notification/events';
import { ensureBucket } from './storage/s3';

// `ws` is CJS; Node ESM rejects `import { WebSocketServer } from 'ws'` at
// runtime in the Docker image. Require + `Server` fallback covers both the
// v8 `WebSocketServer` export and older `Server` alias if a transitive
// dependency wins the hoisted install.
const require = createRequire(import.meta.url);
const wsModule = require('ws') as typeof import('ws') & {
  Server: typeof import('ws').WebSocketServer;
};
const WebSocketServerCtor = wsModule.WebSocketServer ?? wsModule.Server;

// Create the documents bucket if it is missing, so a fresh `docker compose up`
// with an empty MinIO volume is usable without a manual step in the console.
// Non-fatal: everything except document upload works without object storage,
// and failing to boot the whole API over it would be the wrong trade.
await ensureBucket().catch((error: unknown) => {
  console.error('[storage] bucket unavailable — document upload will fail:', error);
});

// Boot. `env` is validated at import time and will exit(1) on bad config.
messageHub.start();
notificationHub.start();
startMessageWorker();

const wss = new WebSocketServerCtor({ noServer: true });

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
    websocket: { server: wss },
  },
  (info) => {
    console.log(`[api] listening on http://localhost:${info.port}`);
    console.log(`[api] Swagger UI:  http://localhost:${info.port}/docs`);
    console.log(`[api] OpenAPI doc: http://localhost:${info.port}/openapi.json`);
    console.log(`[api] Messages WS: ws://localhost:${info.port}/ws/messages`);
    console.log(`[api] Notifications WS: ws://localhost:${info.port}/ws/notifications`);
  },
);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received — shutting down`);

  try {
    await stopMessageWorker();
    await closeMessageQueue();
    await messageHub.stop();
    await notificationHub.stop();
    await closeNotificationPublisher();
  } catch (err) {
    console.error('[api] error while stopping messaging infra', err);
  }

  try {
    wss.close();
  } catch (err) {
    console.error('[api] error while closing WebSocket server', err);
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    // Force-exit if the HTTP server hangs on open connections.
    setTimeout(resolve, 8_000).unref();
  });

  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
