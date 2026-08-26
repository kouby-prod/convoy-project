import { lte } from 'drizzle-orm';
import { db } from '../../db/client';
import { accountDeletion } from '../../db/account-deletion';
import { account, session, user } from '../../db/auth-schema';
import { eq } from 'drizzle-orm';

function isRestrictError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23503';
}

async function anonymizeUser(userId: string, email: string): Promise<void> {
  await db
    .update(user)
    .set({
      name: 'Deleted account',
      email: `deleted-${userId}@deleted.invalid`,
      emailVerified: false,
      image: null,
      phoneNumber: null,
      phoneNumberVerified: false,
      banned: true,
      banReason: 'Account deleted',
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(account).where(eq(account.userId, userId));
  await db.delete(accountDeletion).where(eq(accountDeletion.userId, userId));
  console.log(`[account-deletion] anonymized ${email} (ledger FKs block a hard delete)`);
}

/**
 * Permanently remove accounts whose 30-day hold has elapsed. Invoice/payment
 * FKs stay restrict — those users are anonymized so they cannot sign in, while
 * the ledger rows keep a stub user id.
 */
export async function purgeDueAccounts(now = new Date()): Promise<{ purged: number; anonymized: number }> {
  const due = await db.select().from(accountDeletion).where(lte(accountDeletion.purgeAt, now));
  let purged = 0;
  let anonymized = 0;

  for (const row of due) {
    const [accountRow] = await db.select({ email: user.email }).from(user).where(eq(user.id, row.userId));
    const email = accountRow?.email ?? row.userId;
    try {
      await db.delete(user).where(eq(user.id, row.userId));
      purged += 1;
      console.log(`[account-deletion] purged ${email}`);
    } catch (err) {
      if (!isRestrictError(err)) throw err;
      await anonymizeUser(row.userId, email);
      anonymized += 1;
    }
  }

  return { purged, anonymized };
}
