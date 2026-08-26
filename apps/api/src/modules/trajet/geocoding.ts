import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { trajet } from '../../db/trajet-schema';

export interface Coordinates {
  lat: number;
  lng: number;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/**
 * OpenStreetMap Nominatim's usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/) requires a
 * descriptive User-Agent and caps requests at 1/second — enforced here as a
 * process-wide serialized queue (not a per-call sleep, which would let
 * concurrent callers race past each other and blow the limit together).
 */
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;
let throttleQueue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throttle(): Promise<void> {
  const turn = throttleQueue.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  // Never let one failed turn poison every turn after it.
  throttleQueue = turn.catch(() => undefined);
  return turn;
}

/**
 * Geocodes a free-text city name to coordinates. Best-effort: returns `null`
 * (never throws) on any network error, non-OK response, or no match — a
 * geocoding failure must never block publishing or editing a trajet.
 */
export async function geocodeCity(city: string): Promise<Coordinates | null> {
  try {
    await throttle();
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('q', city);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');

    const res = await fetch(url, {
      headers: {
        // Required by Nominatim's usage policy — identifies the calling app.
        'User-Agent': 'CAN-VOITURAGE (carpool trip search, contact via project repo)',
      },
    });
    if (!res.ok) return null;

    const results = (await res.json()) as Array<{ lat: string; lon: string }>;
    const [first] = results;
    if (!first) return null;

    return { lat: Number(first.lat), lng: Number(first.lon) };
  } catch (err) {
    console.error(`Failed to geocode "${city}"`, err);
    return null;
  }
}

interface GeocodeSearchResult {
  label: string;
  lat: number;
  lng: number;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  country?: string;
}

/**
 * A concise "City, Region" label from Nominatim's structured address
 * breakdown (requested via `addressdetails=1`), rather than its full
 * `display_name` (often a whole street address + postal code + country) —
 * keeps `departureCity`/`arrivalCity` readable in trajet listings, the same
 * shape as a manually-typed `CityCombobox` entry ("Montreal"). The precise
 * point the user actually picked still lives in `lat`/`lng`, not this label.
 */
function shortLabel(address: NominatimAddress | undefined, fallback: string): string {
  const locality = address?.city ?? address?.town ?? address?.village ?? address?.municipality;
  if (locality && address?.state) return `${locality}, ${address.state}`;
  if (locality) return locality;
  return fallback;
}

/**
 * Free-text place search for the departure/arrival location picker
 * (apps/web's `LocationPicker`). Best-effort like `geocodeCity`: returns an
 * empty list rather than throwing on any failure.
 */
export async function searchPlaces(query: string, limit = 5): Promise<GeocodeSearchResult[]> {
  try {
    await throttle();
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('addressdetails', '1');

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CAN-VOITURAGE (carpool trip search, contact via project repo)',
      },
    });
    if (!res.ok) return [];

    const results = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
      address?: NominatimAddress;
    }>;
    return results.map((r) => ({
      label: shortLabel(r.address, r.display_name),
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));
  } catch (err) {
    console.error(`Failed to search places for "${query}"`, err);
    return [];
  }
}

/**
 * Reverse-geocodes a coordinate pair to a human-readable label, for the
 * picker's "use my location" button. Best-effort: `null` on any failure.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    await throttle();
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CAN-VOITURAGE (carpool trip search, contact via project repo)',
      },
    });
    if (!res.ok) return null;

    const result = (await res.json()) as { display_name?: string; address?: NominatimAddress };
    if (!result.display_name) return null;
    return shortLabel(result.address, result.display_name);
  } catch (err) {
    console.error(`Failed to reverse-geocode (${lat}, ${lng})`, err);
    return null;
  }
}

/** A trajet endpoint (departure or arrival) as known by the caller. */
interface TrajetEndpoint {
  city: string;
  lat?: number | null;
  lng?: number | null;
}

/**
 * Geocodes a trajet's departure/arrival endpoints and writes the resulting
 * coordinates back, without blocking whatever created/updated the trajet —
 * callers fire this and forget it (see createTrajetRoute/updateTrajetRoute
 * in ./index.ts), so a trajet is immediately bookable while its coordinates
 * fill in a couple of seconds later (or never, if geocoding fails).
 *
 * When a side already carries `lat`/`lng` (the driver picked a precise point
 * via the location picker, rather than typing a free-text city), that side
 * is written back as-is with no Nominatim call — a user-picked point must
 * never be silently degraded to a city-center geocode.
 */
export async function geocodeAndStoreTrajetLocation(
  trajetId: string,
  departure: TrajetEndpoint,
  arrival: TrajetEndpoint,
): Promise<void> {
  // Sequential, not Promise.all: the shared throttle queue already
  // serializes these, so running them "concurrently" would only add
  // Promise bookkeeping, not speed.
  const departureCoords =
    departure.lat != null && departure.lng != null
      ? { lat: departure.lat, lng: departure.lng }
      : await geocodeCity(departure.city);
  const arrivalCoords =
    arrival.lat != null && arrival.lng != null
      ? { lat: arrival.lat, lng: arrival.lng }
      : await geocodeCity(arrival.city);

  await db
    .update(trajet)
    .set({
      departureLat: departureCoords ? departureCoords.lat.toString() : null,
      departureLng: departureCoords ? departureCoords.lng.toString() : null,
      arrivalLat: arrivalCoords ? arrivalCoords.lat.toString() : null,
      arrivalLng: arrivalCoords ? arrivalCoords.lng.toString() : null,
    })
    .where(eq(trajet.id, trajetId));
}
