import type {
  CreateBookingRequest,
  CreateTrajetRequest,
  Trajet,
  TrajetListing,
  TrajetSearchQuery,
} from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';

/**
 * Trajet data access — the single seam between the `/trajet` UI and the API.
 *
 * Everything below talks to the real backend through the typed RPC client. The
 * API speaks `Trajet` (`destinationCity`, `departureDateTime`); the UI renders
 * `TrajetListing` (`arrivalCity`, `departureAt`). `toListing` is the only place
 * that translation happens — components never see the API shape.
 */

/**
 * Server components and the browser reach the API at different addresses once
 * this runs in Docker: the container resolves the API by service name, while
 * the browser only knows the published localhost port. Picking the base URL per
 * environment is what lets `fetchTrajet` run during SSR.
 */
const api = createApiClient(
  typeof window === 'undefined' ? env.INTERNAL_API_URL : env.NEXT_PUBLIC_API_URL,
);

/** `YYYY-MM-DD` for a Date, in local time (never the UTC shift `toISOString` gives). */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * API row → UI listing. Nullable text columns collapse to '' so the markup
 * stays branch-free; `arrivalAt` and the driver's vehicle/rating fields stay
 * null because the UI genuinely hides them when unknown.
 */
function toListing(row: Trajet): TrajetListing {
  return {
    id: row.id,
    departureCity: row.departureCity,
    departurePlace: row.departurePlace ?? '',
    arrivalCity: row.destinationCity,
    arrivalPlace: row.arrivalPlace ?? '',
    departureAt: row.departureDateTime,
    arrivalAt: row.arrivalDateTime,
    pricePerSeat: row.pricePerSeat,
    seatsTotal: row.seatsTotal,
    seatsAvailable: row.seatsAvailable,
    amenities: row.amenities,
    hasIntermediateStop: row.hasIntermediateStop,
    description: row.description ?? '',
    comfort: row.comfort ?? null,
    baggageAllowance: row.baggageAllowance ?? null,
    driver: row.driver,
  };
}

/**
 * Drop empty filters so the request carries only what the user actually chose —
 * a missing param and an empty one are not the same to the query contract.
 */
function toQueryParams(query: TrajetSearchQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.from) params.from = query.from;
  if (query.to) params.to = query.to;
  if (query.date) params.date = query.date;
  if (query.time) params.time = query.time;
  if (query.seats !== undefined) params.seats = String(query.seats);
  if (query.maxPrice !== undefined) params.maxPrice = String(query.maxPrice);
  if (query.amenities.length > 0) params.amenities = query.amenities.join(',');
  if (query.stopPolicy && query.stopPolicy !== 'any') params.stopPolicy = query.stopPolicy;
  return params;
}

/** GET /trajets — search results for the `/trajet` page. Filtered server-side. */
export async function fetchTrajets(query: TrajetSearchQuery): Promise<TrajetListing[]> {
  const res = await api.trajets.$get({ query: toQueryParams(query) });
  if (!res.ok) throw new Error(`Failed to load trajets (${res.status})`);
  const rows = await res.json();
  return rows.map(toListing);
}

/** GET /trajets/:id — the ride detail page. Resolves to null when unknown. */
export async function fetchTrajet(id: string): Promise<TrajetListing | null> {
  const res = await api.trajets[':id'].$get({ param: { id } });
  if (!res.ok) {
    // Widened to `number`: 404 is the route's only declared error, so comparing
    // the literal type directly would narrow the throw branch to `never`.
    const status: number = res.status;
    if (status === 404) return null;
    throw new Error(`Failed to load trajet (${status})`);
  }
  return toListing(await res.json());
}

/** POST /trajets — publish a ride. Requires a session; returns the created row. */
export async function createTrajet(input: CreateTrajetRequest): Promise<TrajetListing> {
  const res = await api.trajets.$post({
    json: {
      departureCity: input.departureCity,
      destinationCity: input.arrivalCity,
      departureDateTime: input.departureAt,
      departurePlace: input.departurePlace,
      arrivalPlace: input.arrivalPlace,
      arrivalDateTime: input.arrivalAt,
      seatsTotal: input.seatsTotal,
      pricePerSeat: input.pricePerSeat,
      description: input.description,
      amenities: input.amenities,
      hasIntermediateStop: input.hasIntermediateStop,
      comfort: input.comfort,
      baggageAllowance: input.baggageAllowance,
    },
  });
  if (!res.ok) throw new Error(`Failed to publish trajet (${res.status})`);
  return toListing(await res.json());
}

/**
 * POST /trajets/:id/book — reserve a seat from the ride detail page.
 *
 * Books a single seat: the form has no seat selector, and the passenger is the
 * authenticated user. The contact details they typed ride along and are stored
 * with the reservation for the driver to see.
 */
export async function createBooking(input: CreateBookingRequest): Promise<{ id: string }> {
  const res = await api.trajets[':id'].book.$post({
    param: { id: input.trajetId },
    json: {
      seats: 1,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      message: input.message,
    },
  });
  if (!res.ok) throw new Error(`Failed to book seat (${res.status})`);
  const created = await res.json();
  return { id: created.id };
}
