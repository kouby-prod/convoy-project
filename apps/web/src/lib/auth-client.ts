import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';
import { env } from './env';

/**
 * BetterAuth browser client — the single entry point for auth from the web app.
 *
 * `baseURL` points at the API origin; the client appends `/api/auth/*` itself,
 * matching the handler mounted in `apps/api/src/app.ts`. Cookies are sent
 * cross-origin (web :3000 → api :3001) via `credentials: 'include'`; the API's
 * credentialed CORS + trustedOrigins allow it.
 *
 * `adminClient` mirrors the server's `admin` plugin so `session.user.role` is
 * typed — the navbar needs it to decide whether to offer the backoffice link.
 * That is presentation only: `/admin` itself is guarded by `requireRole('admin')`
 * on the API, so hiding the link is convenience, never the security boundary.
 * The server's `phoneNumber` plugin has a matching `phoneNumberClient` — add it
 * when the web app actually surfaces phone OTP.
 */
export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_API_URL,
  plugins: [adminClient()],
  fetchOptions: {
    credentials: 'include',
  },
});

/**
 * Whether a session's user holds the admin role. Roles are stored
 * comma-separated, so this splits before comparing — mirrors `hasRole` on the
 * API side, where the check that actually matters lives.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return (role ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .includes('admin');
}
