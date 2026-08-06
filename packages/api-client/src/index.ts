import { hc } from 'hono/client';
import type { AppType } from '@carpool/api';
import type { PingResponse } from '@carpool/schemas';

/**
 * Typed Hono RPC client. The generic `AppType` is the API app's exported route
 * type, so every path, method, param and response body is fully inferred —
 * there is no hand-written request/response typing anywhere below.
 */
export type ApiClient = ReturnType<typeof hc<AppType>>;

/**
 * Create an RPC client bound to a given API base URL (e.g. http://localhost:3001).
 *
 * `options.headers` lets a caller attach per-request headers computed at call
 * time (sync or async) — the mobile app uses this to read its session cookie
 * out of SecureStore, since React Native's `fetch` has no cookie jar to send
 * `credentials: 'include'` from. Web callers omit it and keep relying on the
 * browser's cookie jar.
 */
export function createApiClient(
  baseUrl: string,
  options?: {
    headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  },
): ApiClient {
  return hc<AppType>(baseUrl, {
    init: {
      credentials: 'include',
    },
    ...(options?.headers ? { headers: options.headers } : {}),
  });
}

/**
 * Call GET /ping and return the parsed body.
 *
 * The return type is the shared `PingResponse` contract. `res.json()` is
 * inferred from the API route definition, so if the `PingResponse` schema in
 * `@carpool/schemas` changes, this function (and its callers) stop type-checking
 * until updated. That is the contract spine working as intended.
 */
export async function getPing(baseUrl: string): Promise<PingResponse> {
  const client = createApiClient(baseUrl);
  const res = await client.ping.$get();
  if (!res.ok) {
    throw new Error(`Ping request failed with status ${res.status}`);
  }
  return res.json();
}
