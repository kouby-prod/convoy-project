import type { UpsertVehicle, Vehicle } from '@carpool/schemas';
import { api } from './api-client';

/** GET /vehicles/me — the signed-in driver's own vehicle, or null if none declared yet. */
export async function fetchMyVehicle(): Promise<Vehicle | null> {
  const res = await api.vehicles.me.$get();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load your vehicle');
  return res.json();
}

/** PUT /vehicles/me — declare or correct the driver's vehicle. */
export async function saveMyVehicle(vehicle: UpsertVehicle): Promise<Vehicle> {
  const res = await api.vehicles.me.$put({ json: vehicle });
  if (!res.ok) throw new Error('Failed to save your vehicle');
  return res.json();
}
