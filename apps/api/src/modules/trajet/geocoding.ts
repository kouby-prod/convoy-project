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

/**
 * Geocodes a trajet's departure/arrival cities and writes the resulting
 * coordinates back, without blocking whatever created/updated the trajet —
 * callers fire this and forget it (see createTrajetRoute/updateTrajetRoute
 * in ./index.ts), so a trajet is immediately bookable while its coordinates
 * fill in a couple of seconds later (or never, if geocoding fails).
 */
export async function geocodeAndStoreTrajetLocation(
  trajetId: string,
  departureCity: string,
  arrivalCity: string,
): Promise<void> {
  // Sequential, not Promise.all: the shared throttle queue already
  // serializes these, so running them "concurrently" would only add
  // Promise bookkeeping, not speed.
  const departure = await geocodeCity(departureCity);
  const arrival = await geocodeCity(arrivalCity);

  await db
    .update(trajet)
    .set({
      departureLat: departure ? departure.lat.toString() : null,
      departureLng: departure ? departure.lng.toString() : null,
      arrivalLat: arrival ? arrival.lat.toString() : null,
      arrivalLng: arrival ? arrival.lng.toString() : null,
    })
    .where(eq(trajet.id, trajetId));
}
