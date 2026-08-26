import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { verifyPassword } from 'better-auth/crypto';
import { ACCOUNT_DELETION_RETENTION_DAYS, type AccountDeletionStatus } from '@carpool/schemas';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { sendEmail } from '../../auth/email';
import { rateLimit } from '../../middleware/rate-limit';
import { db } from '../../db/client';
import { accountDeletion } from '../../db/account-deletion';
import { account } from '../../db/auth-schema';
import {
  cancelAccountDeletionRoute,
  getAccountDeletionRoute,
  scheduleAccountDeletionRoute,
} from './account-deletion.routes';

const scheduleRateLimit = rateLimit<AuthEnv>({
  windowSeconds: 60,
  max: 3,
  keyGenerator: (c) => getAuth(c).user.id,
});

const app = new OpenAPIHono<AuthEnv>();
app.use('/account/deletion', requireAuth);
app.use(
  '/account/deletion',
  async (c, next) => (c.req.method === 'POST' ? scheduleRateLimit(c, next) : next()),
);

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

async function credentialPasswordHash(userId: string): Promise<string | null> {
  const rows = await db
    .select({ password: account.password, providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId));
  const credential = rows.find((row) => row.providerId === 'credential' && row.password);
  return credential?.password ?? null;
}

async function statusFor(userId: string): Promise<AccountDeletionStatus> {
  const [row] = await db.select().from(accountDeletion).where(eq(accountDeletion.userId, userId));
  const passwordRequired = Boolean(await credentialPasswordHash(userId));
  if (!row) {
    return {
      scheduled: false,
      requestedAt: null,
      purgeAt: null,
      retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
      passwordRequired,
    };
  }
  return {
    scheduled: true,
    requestedAt: row.requestedAt.toISOString(),
    purgeAt: row.purgeAt.toISOString(),
    retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
    passwordRequired,
  };
}

export const accountDeletionModule = app
  .openapi(getAccountDeletionRoute, async (c) => {
    const { user } = getAuth(c);
    return c.json(await statusFor(user.id), 200);
  })
  .openapi(scheduleAccountDeletionRoute, async (c) => {
    const { user } = getAuth(c);
    const body = c.req.valid('json');
    const [existing] = await db.select().from(accountDeletion).where(eq(accountDeletion.userId, user.id));
    if (existing) return c.json({ error: 'Deletion is already scheduled' }, 409);

    const hash = await credentialPasswordHash(user.id);
    if (hash) {
      if (!body.password) return c.json({ error: 'Password is required' }, 400);
      const ok = await verifyPassword({ hash, password: body.password });
      if (!ok) return c.json({ error: 'Incorrect password' }, 400);
    }

    const requestedAt = new Date();
    const purgeAt = addDays(requestedAt, ACCOUNT_DELETION_RETENTION_DAYS);
    await db.insert(accountDeletion).values({ userId: user.id, requestedAt, purgeAt });

    await sendEmail({
      to: user.email,
      subject: 'Your Convoy account will be deleted in 30 days / Votre compte Convoy sera supprimé dans 30 jours',
      text: [
        `Your Convoy account is scheduled for permanent deletion on ${purgeAt.toISOString()}.`,
        'Sign in before that date and cancel the deletion from Settings if you change your mind.',
        '',
        `Votre compte Convoy sera définitivement supprimé le ${purgeAt.toISOString()}.`,
        'Connectez-vous avant cette date et annulez la suppression dans Paramètres si vous changez d’avis.',
      ].join('\n'),
    });

    return c.json(await statusFor(user.id), 200);
  })
  .openapi(cancelAccountDeletionRoute, async (c) => {
    const { user } = getAuth(c);
    const deleted = await db
      .delete(accountDeletion)
      .where(eq(accountDeletion.userId, user.id))
      .returning({ userId: accountDeletion.userId });
    if (deleted.length === 0) return c.json({ error: 'No deletion is scheduled' }, 404);

    await sendEmail({
      to: user.email,
      subject: 'Convoy account deletion cancelled / Suppression du compte Convoy annulée',
      text: [
        'Your Convoy account will stay active. The 30-day deletion hold is cancelled.',
        'Votre compte Convoy reste actif. Le délai de suppression de 30 jours est annulé.',
      ].join('\n'),
    });

    return c.json(await statusFor(user.id), 200);
  });
