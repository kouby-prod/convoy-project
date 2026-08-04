import { createAuthClient } from 'better-auth/react';
import { phoneNumberClient } from 'better-auth/client/plugins';
import { env } from './env';

/**
 * BetterAuth browser client — the single entry point for auth from the web app.
 *
 * `baseURL` points at the API origin; the client appends `/api/auth/*` itself,
 * matching the handler mounted in `apps/api/src/app.ts`. Cookies are sent
 * cross-origin (web :3000 → api :3001) via `credentials: 'include'`; the API's
 * credentialed CORS + trustedOrigins allow it.
 *
 * `phoneNumberClient` only adds the `phoneNumber`/`phoneNumberVerified` fields
 * to the inferred session type (read on the account-settings page) — it does
 * not by itself surface an OTP flow in the UI. The server's `admin` plugin
 * has a matching client plugin (`adminClient`) too — add it when the web app
 * actually surfaces role-gated UI.
 */
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_API_URL,
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [phoneNumberClient()],
});
