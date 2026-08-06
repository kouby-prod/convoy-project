import { createApiClient } from '@carpool/api-client';
import { authClient } from './auth-client';
import { env } from './env';

// `expoClient`'s `getCookie` action doesn't merge into `createAuthClient`'s
// inferred return type (an upstream generic-inference limitation between
// `@better-auth/expo` and `better-auth/react` — see the `@ts-expect-error` in
// auth-client.ts). The action exists and works at runtime; this narrows just
// enough to call it without widening the rest of `authClient`'s real type.
const authClientWithCookie = authClient as unknown as { getCookie: () => string };

/**
 * Shared, typed RPC client for every screen. React Native's `fetch` has no
 * cookie jar, so instead of `credentials: 'include'` (the web's approach) we
 * read the session cookie `expoClient` persisted in SecureStore and attach it
 * as a `Cookie` header on every request — `requireAuth` on the API side
 * accepts a session cookie or a bearer token interchangeably.
 */
export const api = createApiClient(env.EXPO_PUBLIC_API_URL, {
  headers: () => {
    const cookie = authClientWithCookie.getCookie();
    const headers: Record<string, string> = {};
    if (cookie) headers.Cookie = cookie;
    return headers;
  },
});
