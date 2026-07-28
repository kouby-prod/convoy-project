import {
  type CreateBookingRequest,
  type CreateTrajetRequest,
  type TrajetListing,
  type TrajetSearchQuery,
} from '@carpool/schemas';

/**
 * Trajet data access — the single seam between the UI and the API.
 *
 * The backend `trajet` module does not exist yet, so every function below
 * resolves against the in-memory fixtures at the bottom of this file. The
 * shapes are the shared `@carpool/schemas` contracts, so wiring the real API is
 * a body swap here and nothing else:
 *
 *   const api = createApiClient(env.NEXT_PUBLIC_API_URL);
 *   const res = await api.trajet.$get({ query });
 *   if (!res.ok) throw new Error('Failed to load trajets');
 *   return res.json();
 *
 * Run `/backend-feature trajet` to generate that module.
 */

/** Simulated network latency, so the loading states are actually exercised. */
const FIXTURE_LATENCY_MS = 300;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), FIXTURE_LATENCY_MS));
}

/** `YYYY-MM-DD` for a Date, in local time (never the UTC shift `toISOString` gives). */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Minutes since midnight for an ISO instant, in the viewer's local time. */
function minutesOfDay(isoDate: string): number {
  const date = new Date(isoDate);
  return date.getHours() * 60 + date.getMinutes();
}

/** Parse an `HH:MM` filter value into minutes since midnight, or null. */
function parseTimeFilter(time: string | undefined): number | null {
  if (!time) return null;
  const [hour, minute] = time.split(':');
  const hours = Number.parseInt(hour ?? '', 10);
  const minutes = Number.parseInt(minute ?? '', 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function includesCity(haystack: string, needle: string | undefined): boolean {
  if (!needle) return true;
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

/** GET /trajet — search results for the `/trajet` page. */
export async function fetchTrajets(query: TrajetSearchQuery): Promise<TrajetListing[]> {
  const earliest = parseTimeFilter(query.time);

  const results = FIXTURES.filter((trajet) => {
    if (!includesCity(trajet.departureCity, query.from)) return false;
    if (!includesCity(trajet.arrivalCity, query.to)) return false;
    if (query.date && toDateKey(new Date(trajet.departureAt)) !== query.date) return false;
    if (earliest !== null && minutesOfDay(trajet.departureAt) < earliest) return false;
    if (query.seats && trajet.seatsAvailable < query.seats) return false;
    if (query.maxPrice !== undefined && trajet.pricePerSeat > query.maxPrice) return false;
    if (query.stopPolicy === 'direct' && trajet.hasIntermediateStop) return false;
    if (query.stopPolicy === 'withStops' && !trajet.hasIntermediateStop) return false;
    // Every selected amenity must be offered — filters narrow, they never widen.
    return query.amenities.every((amenity) => trajet.amenities.includes(amenity));
  }).sort((a, b) => a.departureAt.localeCompare(b.departureAt));

  return delay(results);
}

/** GET /trajet/:id — the ride detail page. Resolves to null when unknown. */
export async function fetchTrajet(id: string): Promise<TrajetListing | null> {
  return delay(FIXTURES.find((trajet) => trajet.id === id) ?? null);
}

/** POST /trajet — publish a ride. Returns the created row. */
export async function createTrajet(input: CreateTrajetRequest): Promise<TrajetListing> {
  const created: TrajetListing = {
    id: `trajet-${FIXTURES.length + 1}`,
    ...input,
    seatsAvailable: input.seatsTotal,
    driver: FIXTURES[0]!.driver,
  };
  return delay(created);
}

/** POST /booking — reserve a seat from the ride detail page. */
export async function createBooking(input: CreateBookingRequest): Promise<{ id: string }> {
  return delay({ id: `booking-${input.trajetId}` });
}

// ---------------------------------------------------------------------------
// Fixtures — delete this block once the backend module serves real rows.
// ---------------------------------------------------------------------------

/**
 * ISO instant for `dayOffset` days from today at `hour:minute` UTC.
 *
 * Built from UTC parts on purpose: this module runs both on the server (whose
 * zone is UTC in Docker) and in the browser (whose zone is the visitor's), and
 * a ride must be the same instant in both. Display is then pinned to one zone
 * by `timeZone` in `src/i18n/request.ts`.
 */
function at(dayOffset: number, hour: number, minute: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, hour, minute),
  ).toISOString();
}

const FIXTURES: TrajetListing[] = [
  {
    id: 'paris-lyon-morning',
    departureCity: 'Paris',
    departurePlace: 'Gare de Bercy',
    arrivalCity: 'Lyon',
    arrivalPlace: 'Part-Dieu',
    departureAt: at(0, 7, 30),
    arrivalAt: at(0, 12, 15),
    pricePerSeat: 32,
    seatsTotal: 4,
    seatsAvailable: 3,
    amenities: ['cardPayment', 'nonSmoking', 'pets', 'skiRack', 'luggage'],
    hasIntermediateStop: false,
    description: 'Départ à l’heure, une pause café à mi-chemin.',
    driver: {
      id: 'driver-camille',
      firstName: 'Camille',
      lastName: 'Rousseau',
      licenceYears: 12,
      carMake: 'Peugeot',
      carModel: '308',
      carSeats: 5,
      rating: 4.6,
      reviewCount: 87,
    },
  },
  {
    id: 'paris-lyon-evening',
    departureCity: 'Paris',
    departurePlace: 'Porte d’Italie',
    arrivalCity: 'Lyon',
    arrivalPlace: 'Perrache',
    departureAt: at(0, 18, 45),
    arrivalAt: at(0, 23, 30),
    pricePerSeat: 27,
    seatsTotal: 4,
    seatsAvailable: 1,
    amenities: ['nonSmoking', 'noPets', 'luggage', 'insurance'],
    hasIntermediateStop: true,
    description: 'Arrêt possible à Beaune et à Mâcon.',
    driver: {
      id: 'driver-yanis',
      firstName: 'Yanis',
      lastName: 'Bertrand',
      licenceYears: 6,
      carMake: 'Renault',
      carModel: 'Mégane',
      carSeats: 5,
      rating: 4.2,
      reviewCount: 41,
    },
  },
  {
    id: 'lille-bruxelles',
    departureCity: 'Lille',
    departurePlace: 'Gare Lille Flandres',
    arrivalCity: 'Bruxelles',
    arrivalPlace: 'Gare du Midi',
    departureAt: at(1, 9, 0),
    arrivalAt: at(1, 10, 30),
    pricePerSeat: 12,
    seatsTotal: 3,
    seatsAvailable: 2,
    amenities: ['cardPayment', 'nonSmoking', 'handLuggage', 'bikeRack'],
    hasIntermediateStop: false,
    description: 'Trajet direct, idéal pour un aller-retour dans la journée.',
    driver: {
      id: 'driver-sofia',
      firstName: 'Sofia',
      lastName: 'Meunier',
      licenceYears: 9,
      carMake: 'Volkswagen',
      carModel: 'Golf',
      carSeats: 5,
      rating: 4.9,
      reviewCount: 132,
    },
  },
  {
    id: 'bordeaux-toulouse',
    departureCity: 'Bordeaux',
    departurePlace: 'Place des Quinconces',
    arrivalCity: 'Toulouse',
    arrivalPlace: 'Matabiau',
    departureAt: at(1, 14, 15),
    arrivalAt: at(1, 16, 45),
    pricePerSeat: 19,
    seatsTotal: 4,
    seatsAvailable: 4,
    amenities: ['smoking', 'pets', 'luggage', 'handLuggage'],
    hasIntermediateStop: true,
    description: 'Je récupère aussi à Agen si besoin.',
    driver: {
      id: 'driver-noor',
      firstName: 'Noor',
      lastName: 'Haddad',
      licenceYears: 3,
      carMake: 'Citroën',
      carModel: 'C3',
      carSeats: 5,
      rating: 4.0,
      reviewCount: 18,
    },
  },
  {
    id: 'marseille-nice',
    departureCity: 'Marseille',
    departurePlace: 'Saint-Charles',
    arrivalCity: 'Nice',
    arrivalPlace: 'Gare Thiers',
    departureAt: at(2, 8, 20),
    arrivalAt: at(2, 10, 40),
    pricePerSeat: 15,
    seatsTotal: 3,
    seatsAvailable: 2,
    amenities: ['cardPayment', 'nonSmoking', 'noPets', 'insurance', 'luggage'],
    hasIntermediateStop: false,
    description: 'Voiture non-fumeur, musique douce.',
    driver: {
      id: 'driver-elias',
      firstName: 'Elias',
      lastName: 'Fontaine',
      licenceYears: 15,
      carMake: 'Toyota',
      carModel: 'Corolla',
      carSeats: 5,
      rating: 4.7,
      reviewCount: 205,
    },
  },
  {
    id: 'nantes-rennes',
    departureCity: 'Nantes',
    departurePlace: 'Commerce',
    arrivalCity: 'Rennes',
    arrivalPlace: 'République',
    departureAt: at(2, 17, 10),
    arrivalAt: at(2, 18, 55),
    pricePerSeat: 9,
    seatsTotal: 4,
    seatsAvailable: 3,
    amenities: ['nonSmoking', 'pets', 'bikeRack', 'handLuggage'],
    hasIntermediateStop: true,
    description: 'Porte-vélos disponible, prévenez-moi à l’avance.',
    driver: {
      id: 'driver-lou',
      firstName: 'Lou',
      lastName: 'Perrin',
      licenceYears: 5,
      carMake: 'Dacia',
      carModel: 'Sandero',
      carSeats: 5,
      rating: 4.4,
      reviewCount: 63,
    },
  },
  {
    id: 'strasbourg-nancy',
    departureCity: 'Strasbourg',
    departurePlace: 'Gare centrale',
    arrivalCity: 'Nancy',
    arrivalPlace: 'Place Stanislas',
    departureAt: at(3, 6, 45),
    arrivalAt: at(3, 8, 30),
    pricePerSeat: 11,
    seatsTotal: 2,
    seatsAvailable: 1,
    amenities: ['cardPayment', 'nonSmoking', 'insurance', 'luggage'],
    hasIntermediateStop: false,
    description: 'Trajet régulier du lundi, ponctualité garantie.',
    driver: {
      id: 'driver-margaux',
      firstName: 'Margaux',
      lastName: 'Lefevre',
      licenceYears: 20,
      carMake: 'Ford',
      carModel: 'Focus',
      carSeats: 5,
      rating: 4.8,
      reviewCount: 156,
    },
  },
];
