import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, pool } from './db/client';
import { user, trajet } from './db/schema';

/**
 * Seed 100 published trajets for local/dev testing of the `/trajet` search
 * and detail pages.
 *
 * Creates a small pool of dedicated "seed-driver-*" accounts (idempotent —
 * re-running reuses them rather than duplicating) and spreads the trajets
 * across them with randomized routes, dates, prices, amenities and comfort
 * tiers. Coordinates are set directly from a hardcoded city table instead of
 * going through the real (rate-limited) Nominatim geocoder, so proximity
 * search works immediately without waiting on the background job.
 *
 * Re-running this script adds another 100 trajets rather than replacing the
 * previous batch — trajet rows have no natural key to upsert on.
 *
 * Usage: pnpm --filter @carpool/api seed:trajets
 */

const TRAJET_COUNT = 100;
const DRIVER_COUNT = 12;

const CITIES: Record<string, { lat: number; lng: number; places: string[] }> = {
  Montréal: {
    lat: 45.5019,
    lng: -73.5674,
    places: ['Gare Centrale', 'Métro Berri-UQAM', 'Marché Atwater', 'Stade Olympique', 'Métro Longueuil'],
  },
  Québec: {
    lat: 46.8139,
    lng: -71.208,
    places: ['Gare du Palais', 'Université Laval', 'Vieux-Québec', 'Terminus Sainte-Foy'],
  },
  Gatineau: { lat: 45.4765, lng: -75.7013, places: ['Place du Portage', "Cégep de l'Outaouais"] },
  Sherbrooke: { lat: 45.4042, lng: -71.8929, places: ['Université de Sherbrooke', 'Terminus Sherbrooke'] },
  'Trois-Rivières': { lat: 46.3432, lng: -72.5477, places: ['UQTR', 'Terminus Trois-Rivières'] },
  Laval: { lat: 45.6066, lng: -73.7124, places: ['Carrefour Laval', 'Collège Montmorency'] },
  Longueuil: { lat: 45.5312, lng: -73.5185, places: ['Terminus Longueuil', 'Cégep Édouard-Montpetit'] },
  Saguenay: { lat: 48.4283, lng: -71.0686, places: ['Terminus Chicoutimi', 'Cégep de Jonquière'] },
  Drummondville: { lat: 45.8833, lng: -72.4842, places: ['Centre-ville', 'Cégep de Drummondville'] },
  Rimouski: { lat: 48.4489, lng: -68.523, places: ['Terminus Rimouski', 'UQAR'] },
  Ottawa: { lat: 45.4215, lng: -75.6972, places: ["Gare d'Ottawa", "Université d'Ottawa"] },
  Granby: { lat: 45.4, lng: -72.7333, places: ['Terminus Granby', 'Cégep de Granby'] },
};
const CITY_NAMES = Object.keys(CITIES);

const AMENITY_POOL = [
  'smoking',
  'nonSmoking',
  'pets',
  'noPets',
  'skiRack',
  'luggage',
  'handLuggage',
  'insurance',
  'bikeRack',
  'cardPayment',
] as const;

const COMFORT_TIERS = ['standard', 'confort', 'premium'] as const;

const DESCRIPTIONS = [
  'Départ ponctuel, musique au choix des passagers.',
  'Petit coffre disponible, pas de fumeurs dans la voiture.',
  "Je fais ce trajet chaque semaine, n'hésitez pas à réserver à l'avance.",
  'Arrêt possible en chemin pour un café.',
  'Voiture climatisée, place pour bagages moyens.',
  null,
  null,
];

const BAGGAGE_OPTIONS = ['Un bagage cabine par personne', 'Petit sac uniquement', 'Coffre disponible sur demande', null];

const FIRST_NAMES = ['Alex', 'Marie', 'Jean', 'Sophie', 'Karim', 'Fatima', 'Nicolas', 'Julie', 'Simon', 'Camille', 'Émile', 'Laura'];
const LAST_NAMES = ['Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'Girard'];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function pickSubset<T>(items: readonly T[], max: number): T[] {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.floor(Math.random() * (max + 1)));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Small jitter so seeded coordinates aren't all identical per city. */
function jitter(value: number): number {
  return value + (Math.random() - 0.5) * 0.08;
}

async function ensureSeedDrivers(): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= DRIVER_COUNT; i++) {
    const email = `seed-driver-${i}@example.com`;
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const id = randomUUID();
    await db.insert(user).values({
      id,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      email,
      emailVerified: true,
    });
    ids.push(id);
  }
  return ids;
}

function buildTrajet(driverIds: string[]) {
  const departureCityName = pick(CITY_NAMES);
  let arrivalCityName = pick(CITY_NAMES);
  while (arrivalCityName === departureCityName) arrivalCityName = pick(CITY_NAMES);
  const departure = CITIES[departureCityName]!;
  const arrival = CITIES[arrivalCityName]!;

  // Departures spread over the next 45 days, at a plausible hour.
  const departureAt = new Date(Date.now() + randomInt(1, 45) * 24 * 60 * 60 * 1000);
  departureAt.setHours(randomInt(5, 22), pick([0, 15, 30, 45]), 0, 0);

  // ~70% of drivers give an arrival estimate; the rest leave it unknown.
  const arrivalAt =
    Math.random() > 0.3 ? new Date(departureAt.getTime() + randomInt(1, 6) * 60 * 60 * 1000) : null;

  const seatsTotal = randomInt(1, 4);

  return {
    id: randomUUID(),
    driverId: pick(driverIds),
    departureCity: departureCityName,
    arrivalCity: arrivalCityName,
    departureLat: jitter(departure.lat).toFixed(6),
    departureLng: jitter(departure.lng).toFixed(6),
    arrivalLat: jitter(arrival.lat).toFixed(6),
    arrivalLng: jitter(arrival.lng).toFixed(6),
    departureAt,
    departurePlace: pick(departure.places),
    arrivalPlace: pick(arrival.places),
    arrivalAt,
    seatsTotal,
    seatsAvailable: seatsTotal,
    pricePerSeat: randomInt(8, 55).toString(),
    description: pick(DESCRIPTIONS),
    comfort: pick(COMFORT_TIERS),
    baggageAllowance: pick(BAGGAGE_OPTIONS),
    amenities: pickSubset(AMENITY_POOL, 4),
    hasIntermediateStop: Math.random() > 0.75,
  };
}

async function main(): Promise<void> {
  const driverIds = await ensureSeedDrivers();
  console.log(`[seed] ${driverIds.length} seed driver accounts ready`);

  const rows = Array.from({ length: TRAJET_COUNT }, () => buildTrajet(driverIds));
  await db.insert(trajet).values(rows);

  console.log(`[seed] inserted ${rows.length} trajets`);
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
