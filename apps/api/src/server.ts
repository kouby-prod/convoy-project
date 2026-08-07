import { createRequire } from 'node:module';
import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './env';
import { messageHub } from './realtime/hub';
import { startMessageWorker } from './queue/message-worker';

// `ws` is CJS; Node ESM rejects `import { WebSocketServer } from 'ws'` at
// runtime in the Docker image. Require + `Server` fallback covers both the
// v8 `WebSocketServer` export and older `Server` alias if a transitive
// dependency wins the hoisted install.
const require = createRequire(import.meta.url);
const wsModule = require('ws') as typeof import('ws') & {
  Server: typeof import('ws').WebSocketServer;
};
const WebSocketServerCtor = wsModule.WebSocketServer ?? wsModule.Server;

// Boot. `env` is validated at import time and will exit(1) on bad config.
messageHub.start();
startMessageWorker();

const wss = new WebSocketServerCtor({ noServer: true });

serve(
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
  },
);
