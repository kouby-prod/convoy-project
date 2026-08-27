import type { LiveLocation } from '@carpool/schemas';
import { createRedisConnection } from '../../queue/redis';

const LOCATION_KEY_PREFIX = 'location:latest:trajet:';

/**
 * A share is considered stopped once nothing has pinged in this long — the
 * client sends roughly every 8-10s (see `apps/web/src/hooks/use-live-location-share.ts`),
 * so this gives a couple of missed beats of slack before the last known
 * position silently disappears (e.g. the driver's tab crashed or lost signal,
 * with no chance to call the explicit stop endpoint).
 */
export const LOCATION_TTL_SECONDS = 120;

let client: ReturnType<typeof createRedisConnection> | undefined;
function redis() {
  if (!client) client = createRedisConnection('location-store');
  return client;
}

export function locationKey(trajetId: string): string {
  return `${LOCATION_KEY_PREFIX}${trajetId}`;
}

/** Only the latest position is kept — a new ping overwrites the previous one, TTL reset each time. */
export async function setLiveLocation(location: LiveLocation): Promise<void> {
  await redis().set(locationKey(location.trajetId), JSON.stringify(location), 'EX', LOCATION_TTL_SECONDS);
}

export async function getLiveLocation(trajetId: string): Promise<LiveLocation | null> {
  const raw = await redis().get(locationKey(trajetId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LiveLocation;
  } catch {
    return null;
  }
}

export async function clearLiveLocation(trajetId: string): Promise<void> {
  await redis().del(locationKey(trajetId));
}

/** Test / shutdown helper — closes the lazy store connection if it was opened. */
export async function closeLocationStore(): Promise<void> {
  if (client) {
    await client.quit();
    client = undefined;
  }
}
