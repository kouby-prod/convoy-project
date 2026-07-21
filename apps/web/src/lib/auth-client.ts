import { createAuthClient } from 'better-auth/react';
import { env } from './env';

/**
 * BetterAuth browser client — the single entry point for auth from the web app.
 *
 * `baseURL` points at the API origin; the client appends `/api/auth/*` itself,
 * matching the handler mounted in `apps/api/src/app.ts`. Cookies are sent
 * cross-origin (web :3000 → api :3001) via `credentials: 'include'`; the API's
 * credentialed CORS + trustedOrigins allow it.
 *
 * Only email sign-in/up/session are wired here (BetterAuth core). The server's
 * `admin` and `phoneNumber` plugins have matching client plugins
 * (`adminClient`, `phoneNumberClient`) — add them when the web app actually
 * surfaces role-gated UI or phone OTP.
 */
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_API_URL,
  fetchOptions: {
    credentials: 'include',
  },
});
