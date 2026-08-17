import type { UpsertVehicle, Vehicle } from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';
import { ApiError } from './api-error';

/**
 * Vehicle data access — the single seam between the ride-creation "Étape 2"
 * screen and the API. Only ever used from client components, so the
 * browser-facing base URL is the right one (unlike `lib/trajets.ts`, which
 * also runs during SSR).
 */
const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/** GET /vehicles/me — the signed-in driver's own vehicle, or null if none declared yet. */
export async function fetchMyVehicle(): Promise<Vehicle | null> {
  const res = await api.vehicles.me.$get();
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, 'Failed to load your vehicle');
  return res.json();
}

/** PUT /vehicles/me — declare or correct the driver's vehicle. */
export async function saveMyVehicle(vehicle: UpsertVehicle): Promise<Vehicle> {
  const res = await api.vehicles.me.$put({ json: vehicle });
  if (!res.ok) throw new ApiError(res.status, 'Failed to save your vehicle');
  return res.json();
}
