import type { GeocodeResult } from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';

/**
 * Geocode data access — backs `LocationPicker`. Always called from the
 * browser (the picker is a client component), so this only ever needs the
 * public API URL, unlike `trajets.ts`'s SSR-aware base URL.
 */
const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/** GET /geocode/search — free-text place search for the location picker. */
export async function searchPlaces(query: string): Promise<GeocodeResult[]> {
  const res = await api.geocode.search.$get({ query: { q: query } });
  if (!res.ok) return [];
  const { items } = await res.json();
  return items;
}

/** GET /geocode/reverse — best-effort label for a coordinate pair ("use my location"). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const res = await api.geocode.reverse.$get({ query: { lat: String(lat), lng: String(lng) } });
  if (!res.ok) return null;
  const { label } = await res.json();
  return label;
}
