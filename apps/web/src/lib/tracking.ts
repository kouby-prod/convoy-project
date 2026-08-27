import type { LiveLocation, UpdateLiveLocation } from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';
import { ApiError } from './api-error';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/** POST /trajets/:id/location — driver only. Publishes (or refreshes) the live position. */
export async function updateLiveLocation(
  trajetId: string,
  position: UpdateLiveLocation,
): Promise<LiveLocation> {
  const res = await api.trajets[':id'].location.$post({ param: { id: trajetId }, json: position });
  if (!res.ok) throw new ApiError(res.status, 'Failed to publish the live location');
  return res.json();
}

/** GET /trajets/:id/location — driver or a confirmed passenger. */
export async function fetchLiveLocation(trajetId: string): Promise<LiveLocation | null> {
  const res = await api.trajets[':id'].location.$get({ param: { id: trajetId } });
  if (!res.ok) throw new ApiError(res.status, 'Failed to load the live location');
  const { location } = await res.json();
  return location;
}

/** DELETE /trajets/:id/location — driver only. Stops sharing. */
export async function stopLiveLocation(trajetId: string): Promise<void> {
  const res = await api.trajets[':id'].location.$delete({ param: { id: trajetId } });
  if (!res.ok) throw new ApiError(res.status, 'Failed to stop sharing the live location');
}
