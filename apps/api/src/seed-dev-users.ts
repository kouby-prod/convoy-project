import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { env } from './env';
import { db, pool } from './db/client';
import { account, driverEligibility, trajet, user } from './db/schema';

/**
 * Dev-only login accounts (passenger / driver / admin). Idempotent.
 *
 * Usage (from the repo root, against local Postgres):
 *   pnpm seed:dev-users
 *
 * Refuses to run when NODE_ENV is production or when DATABASE_URL /
 * BETTER_AUTH_URL are not loopback — this file is never part of the API image
 * start command.
 */

const DEV_PASSWORD = 'DevPass123!';
const DEV_TRIP_MARKER = '[dev-seed]';

const ACCOUNTS = [
  {
    email: 'admin@kouby.local',
    name: 'Admin Kouby',
    role: 'admin' as const,
    kind: 'admin',
  },
  {
    email: 'driver@kouby.local',
    name: 'Camille Conductrice',
    role: 'user' as const,
    kind: 'driver',
  },
  {
    email: 'passenger@kouby.local',
    name: 'Alex Passager',
    role: 'user' as const,
    kind: 'passenger',
  },
] as const;

function isLoopback(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function assertLocalDev(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[seed] Refusing to create login accounts while NODE_ENV=production. Run `pnpm seed:dev-users` on the host against local Postgres.',
    );
  }
  if (!isLoopback(env.DATABASE_URL)) {
    throw new Error(
      '[seed] DATABASE_URL is not localhost / 127.0.0.1. Refusing to seed login accounts.',
    );
  }
  if (!isLoopback(env.BETTER_AUTH_URL)) {
    throw new Error(
      '[seed] BETTER_AUTH_URL is not localhost / 127.0.0.1. Refusing to seed login accounts.',
    );
  }
}

async function ensureAccount(spec: (typeof ACCOUNTS)[number]): Promise<string> {
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, spec.email));

  const userId = existing?.id ?? randomUUID();

  if (existing) {
    await db
      .update(user)
      .set({ name: spec.name, role: spec.role, emailVerified: true, banned: false })
      .where(eq(user.id, userId));
  } else {
    await db.insert(user).values({
      id: userId,
      name: spec.name,
      email: spec.email,
      emailVerified: true,
      role: spec.role,
    });
  }

  const [credential] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));

  if (credential) {
    await db.update(account).set({ password: passwordHash }).where(eq(account.id, credential.id));
  } else {
    await db.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: passwordHash,
    });
  }

  if (spec.kind === 'driver') {
    await db
      .insert(driverEligibility)
      .values({ userId, dateOfBirth: '1990-05-12' })
      .onConflictDoUpdate({
        target: driverEligibility.userId,
        set: { dateOfBirth: '1990-05-12' },
      });
    await ensureDriverTrips(userId);
  }

  return userId;
}

async function ensureDriverTrips(driverId: string): Promise<void> {
  const [already] = await db
    .select({ id: trajet.id })
    .from(trajet)
    .where(and(eq(trajet.driverId, driverId), eq(trajet.description, DEV_TRIP_MARKER)))
    .limit(1);
  if (already) return;

  const outbound = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  outbound.setHours(8, 30, 0, 0);
  const inbound = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  inbound.setHours(18, 0, 0, 0);

  await db.insert(trajet).values([
    {
      id: randomUUID(),
      driverId,
      departureCity: 'Montréal',
      arrivalCity: 'Québec',
      departureLat: '45.501900',
      departureLng: '-73.567400',
      arrivalLat: '46.813900',
      arrivalLng: '-71.208000',
      departureAt: outbound,
      departurePlace: 'Gare Centrale',
      arrivalPlace: 'Gare du Palais',
      arrivalAt: new Date(outbound.getTime() + 3 * 60 * 60 * 1000),
      seatsTotal: 3,
      seatsAvailable: 3,
      pricePerSeat: '25',
      description: DEV_TRIP_MARKER,
      comfort: 'confort',
      paymentMethods: ['card', 'interac', 'cash'],
    },
    {
      id: randomUUID(),
      driverId,
      departureCity: 'Québec',
      arrivalCity: 'Montréal',
      departureLat: '46.813900',
      departureLng: '-71.208000',
      arrivalLat: '45.501900',
      arrivalLng: '-73.567400',
      departureAt: inbound,
      departurePlace: 'Gare du Palais',
      arrivalPlace: 'Gare Centrale',
      arrivalAt: new Date(inbound.getTime() + 3 * 60 * 60 * 1000),
      seatsTotal: 3,
      seatsAvailable: 3,
      pricePerSeat: '25',
      description: DEV_TRIP_MARKER,
      comfort: 'confort',
      paymentMethods: ['card', 'interac', 'cash'],
    },
  ]);
}

async function main(): Promise<void> {
  assertLocalDev();

  for (const spec of ACCOUNTS) {
    await ensureAccount(spec);
  }

  console.log('[seed] Dev login accounts ready (email already verified):\n');
  console.log('  admin      admin@kouby.local      DevPass123!');
  console.log('  driver     driver@kouby.local     DevPass123!');
  console.log('  passenger  passenger@kouby.local  DevPass123!');
  console.log('\n  Sign in at http://localhost:3000  — driver also has two sample trips.');
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('[seed] failed:', error);
  void pool.end();
  process.exit(1);
});
