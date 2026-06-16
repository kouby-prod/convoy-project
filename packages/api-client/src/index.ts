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
 */
export function createApiClient(baseUrl: string): ApiClient {
  return hc<AppType>(baseUrl);
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
