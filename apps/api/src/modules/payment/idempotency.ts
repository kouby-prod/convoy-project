import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { idempotencyKey } from '../../db/payment';
import { db } from '../../db/client';

/**
 * Replay-safe wrapper for POST /payments. Same user + key + hash returns the
 * cached JSON. Same key with a different body is a conflict (409).
 */
export async function withIdempotency<T>(
  userId: string,
  key: string | undefined,
  requestHash: string,
  run: () => Promise<T>,
): Promise<{ ok: true; value: T; cached: boolean } | { ok: false; status: 409; error: string }> {
  if (!key) {
    const value = await run();
    return { ok: true, value, cached: false };
  }

  const [existing] = await db
    .select()
    .from(idempotencyKey)
    .where(and(eq(idempotencyKey.userId, userId), eq(idempotencyKey.key, key)));

  if (existing) {
    if (existing.requestHash !== requestHash) {
      return { ok: false, status: 409, error: 'Idempotency-Key reused with a different request' };
    }
    return { ok: true, value: existing.responseJson as T, cached: true };
  }

  const value = await run();
  try {
    await db.insert(idempotencyKey).values({
      id: randomUUID(),
      userId,
      key,
      requestHash,
      responseJson: value,
    });
  } catch (err) {
    // A concurrent request with the same key won the insert — re-read.
    const [race] = await db
      .select()
      .from(idempotencyKey)
      .where(and(eq(idempotencyKey.userId, userId), eq(idempotencyKey.key, key)));
    if (race) {
      if (race.requestHash !== requestHash) {
        return { ok: false, status: 409, error: 'Idempotency-Key reused with a different request' };
      }
      return { ok: true, value: race.responseJson as T, cached: true };
    }
    throw err;
  }
  return { ok: true, value, cached: false };
}
