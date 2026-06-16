import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import { auth } from './auth';
import type { AuthEnv, AuthSession, AuthUser } from './context';

/**
 * `requireAuth` — reads the session via BetterAuth's server API
 * (`auth.api.getSession`), attaches the typed `user` and `session` to the Hono
 * context, and returns 401 if there is no valid session.
 *
 * Works for both cookie sessions (web) and bearer tokens (mobile/API): the
 * bearer plugin turns an `Authorization: Bearer <token>` header into a session.
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!result) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', result.user);
  c.set('session', result.session);
  await next();
});

/**
 * `requireRole(role)` — must run after `requireAuth`. Returns 403 if the
 * authenticated user does not have the given role. The admin plugin stores
 * roles as a comma-separated string, so we split before checking.
 */
export function requireRole(role: 'admin' | 'user') {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get('user');

    if (!user) {
      // Defensive: should be unreachable when chained after requireAuth.
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const roles = (user.role ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    if (!roles.includes(role)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    await next();
  });
}

/**
 * Read the authenticated user + session from a `requireAuth`-protected handler.
 * Throws if called outside such a handler (programming error, not a runtime
 * auth failure). Returns non-null, fully-typed values.
 */
export function getAuth(c: Context<AuthEnv>): { user: AuthUser; session: AuthSession } {
  const user = c.get('user');
  const session = c.get('session');
  if (!user || !session) {
    throw new Error('getAuth() called without requireAuth — check middleware order');
  }
  return { user, session };
}
