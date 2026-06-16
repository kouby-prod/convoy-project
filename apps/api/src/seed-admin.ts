import { eq } from 'drizzle-orm';
import { db, pool } from './db/client';
import { user } from './db/schema';

/**
 * Promote the FIRST admin.
 *
 * A role system with no admin is unusable, and the admin plugin's setRole API
 * itself requires an existing admin — a chicken-and-egg problem. This script
 * breaks it by promoting an existing user directly in the database.
 *
 * Usage:
 *   1. Sign up normally (email + password) via /api/auth/sign-up/email.
 *   2. pnpm --filter @carpool/api seed:admin <that-email>
 *
 * After that, this admin can promote others through BetterAuth's admin API.
 */
async function main(): Promise<void> {
  const email = process.argv[2] ?? process.env.SEED_ADMIN_EMAIL;

  if (!email) {
    console.error('Usage: pnpm --filter @carpool/api seed:admin <email>');
    process.exit(1);
  }

  const updated = await db
    .update(user)
    .set({ role: 'admin' })
    .where(eq(user.email, email))
    .returning({ id: user.id, email: user.email, role: user.role });

  if (updated.length === 0) {
    console.error(
      `[seed] No user found with email "${email}". Sign that user up first, then re-run.`,
    );
    await pool.end();
    process.exit(1);
  }

  console.log(`[seed] promoted "${email}" to admin:`, updated[0]);
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
