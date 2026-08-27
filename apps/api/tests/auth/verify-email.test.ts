import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';

function cookieHeader(res: Response): string {
  const cookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') ?? ''];
  return cookies
    .filter(Boolean)
    .map((entry) => entry.split(';')[0])
    .join('; ');
}

/**
 * The first-run path users actually hit: create an account, click the
 * verification URL from the mail, land with a session and emailVerified.
 * Uses BetterAuth's memory adapter so this stays hermetic (no Postgres/Redis).
 */
describe('sign-up → verify-email → session', () => {
  it('marks the user verified and sets a session cookie', async () => {
    const store: Record<string, unknown[]> = {
      user: [],
      session: [],
      account: [],
      verification: [],
    };
    let verificationUrl = '';

    const auth = betterAuth({
      secret: 'test-secret-at-least-32-characters!',
      baseURL: 'http://localhost:3001',
      database: memoryAdapter(store),
      trustedOrigins: ['http://localhost:3000'],
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        requireEmailVerification: true,
      },
      emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ url }) => {
          verificationUrl = url;
        },
      },
      rateLimit: { enabled: false },
    });

    const origin = { Origin: 'http://localhost:3000' };
    const signUp = await auth.handler(
      new Request('http://localhost:3001/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...origin },
        body: JSON.stringify({
          name: 'Ada Lovelace',
          email: 'ada@example.test',
          password: 'password1',
          callbackURL: 'http://localhost:3000/auth/verified',
        }),
      }),
    );

    expect(signUp.status).toBe(200);
    expect(verificationUrl).toContain('/api/auth/verify-email');
    expect(verificationUrl).toContain('token=');

    const verify = await auth.handler(new Request(verificationUrl, { headers: origin }));
    expect(verify.status).toBeGreaterThanOrEqual(200);
    expect(verify.status).toBeLessThan(400);

    const cookies = cookieHeader(verify);
    expect(cookies.length).toBeGreaterThan(0);

    const sessionRes = await auth.handler(
      new Request('http://localhost:3001/api/auth/get-session', {
        headers: { cookie: cookies, ...origin },
      }),
    );
    expect(sessionRes.status).toBe(200);
    const session = (await sessionRes.json()) as {
      user?: { email?: string; emailVerified?: boolean };
    };
    expect(session.user?.email).toBe('ada@example.test');
    expect(session.user?.emailVerified).toBe(true);
  });
});
