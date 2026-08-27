import type { LiveLocation, WsLocationServerFrame } from '@carpool/schemas';
import { createRedisConnection } from '../../queue/redis';

/** Pub/sub channel prefix — `LocationHub` subscribes with `psubscribe(`${prefix}*`)`. */
export const LOCATION_EVENTS_CHANNEL_PREFIX = 'location:trajet:';

export function trajetLocationChannel(trajetId: string): string {
  return `${LOCATION_EVENTS_CHANNEL_PREFIX}${trajetId}`;
}

type LocationEvent = Extract<WsLocationServerFrame, { type: 'location.updated' | 'location.stopped' }>;

let publisher: ReturnType<typeof createRedisConnection> | undefined;
function getPublisher() {
  if (!publisher) publisher = createRedisConnection('location-publisher');
  return publisher;
}

async function publish(trajetId: string, event: LocationEvent): Promise<void> {
  await getPublisher().publish(trajetLocationChannel(trajetId), JSON.stringify(event));
}

/** Called right after a position is stored — failures are caught by the caller and must never fail the ping. */
export async function publishLocationUpdated(location: LiveLocation): Promise<void> {
  await publish(location.trajetId, { type: 'location.updated', trajetId: location.trajetId, location });
}

/** Called when the driver explicitly stops sharing. */
export async function publishLocationStopped(trajetId: string): Promise<void> {
  await publish(trajetId, { type: 'location.stopped', trajetId });
}

/** Test / shutdown helper — closes the lazy publisher connection if it was opened. */
export async function closeLocationPublisher(): Promise<void> {
  if (publisher) {
    await publisher.quit();
    publisher = undefined;
  }
}
