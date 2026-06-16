import type { AuthSession, AuthUser } from './auth';

/**
 * Hono context typing for auth.
 *
 * `AuthEnv` types the variables our middleware attaches. `user`/`session` are
 * nullable here because they are only populated after `requireAuth` runs;
 * inside a `requireAuth`-protected handler use `getAuth(c)` to get the
 * non-null, fully-typed values (no `any`, no `!`).
 */
export interface AuthEnv {
  Variables: {
    user: AuthUser | null;
    session: AuthSession | null;
  };
}

export type { AuthUser, AuthSession };
