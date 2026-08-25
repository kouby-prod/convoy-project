import type {
  AdminBooking,
  AdminBookingQuery,
  AdminDocument,
  AdminDocumentQuery,
  AdminInvoiceQuery,
  AdminInvoiceRow,
  AdminStats,
  AdminTrajet,
  AdminTrajetQuery,
  AdminUser,
  AdminUserQuery,
  DocumentStatus,
  DriverPayout,
  DriverPayoutStatus,
  ReconciliationMismatch,
} from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';
import { ApiError } from './api-error';

/**
 * Backoffice data access — the single seam between the `/admin` panel and the
 * API. Every call here hits an admin-only route, so a 403 is a normal outcome
 * (a signed-in non-admin opening the page), not an exception: the components
 * read `ApiError.status` and render the right message instead of a crash.
 */
const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/** GET /admin/stats — the dashboard counters. */
export async function fetchAdminStats(): Promise<AdminStats> {
  const res = await api.admin.stats.$get();
  if (!res.ok) throw new ApiError(res.status, 'Failed to load statistics');
  return res.json();
}

/**
 * GET /admin/documents — the review queue.
 *
 * Empty filters are dropped rather than sent blank: to the query contract, an
 * absent param and an empty one are not the same thing.
 */
export async function fetchAdminDocuments(query: AdminDocumentQuery): Promise<AdminDocument[]> {
  const params: Record<string, string> = {};
  if (query.status) params.status = query.status;
  if (query.type) params.type = query.type;
  if (query.q) params.q = query.q;

  const res = await api.admin.documents.$get({ query: params });
  if (!res.ok) throw new ApiError(res.status, 'Failed to load the queue');
  return res.json();
}

export interface ReviewInput {
  id: string;
  status: Extract<DocumentStatus, 'approved' | 'rejected'>;
  /** Required by the contract when rejecting — the driver needs to know why. */
  note?: string | null;
  /** Required by the API when approving a LICENCE: the birth date on it was checked. */
  ageConfirmed?: boolean;
}

/** PATCH /admin/documents/:id — approve or reject one submission. */
export async function reviewDocument({
  id,
  status,
  note,
  ageConfirmed,
}: ReviewInput): Promise<AdminDocument> {
  const res = await api.admin.documents[':id'].$patch({
    param: { id },
    json: { status, note: note ? note : null, ageConfirmed },
  });
  if (!res.ok) throw new ApiError(res.status, 'Failed to record the decision');
  return res.json();
}

/** GET /admin/users — accounts with their document tallies, newest first. */
export async function fetchAdminUsers(query: AdminUserQuery = {}): Promise<AdminUser[]> {
  const params: Record<string, string> = {};
  if (query.q) params.q = query.q;
  const res = await api.admin.users.$get({ query: params });
  if (!res.ok) throw new ApiError(res.status, 'Failed to load accounts');
  return res.json();
}

function compactQuery(query: Record<string, string | undefined>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value) params[key] = value;
  }
  return params;
}

/** GET /admin/trajets — published ride ads. */
export async function fetchAdminTrajets(query: AdminTrajetQuery = {}): Promise<AdminTrajet[]> {
  const res = await api.admin.trajets.$get({
    query: compactQuery({
      q: query.q,
      from: query.from,
      to: query.to,
      state: query.state,
    }),
  });
  if (!res.ok) throw new ApiError(res.status, 'Failed to load ads');
  return res.json();
}

/** GET /admin/bookings — reservations by ride date and payment status. */
export async function fetchAdminBookings(query: AdminBookingQuery = {}): Promise<AdminBooking[]> {
  const res = await api.admin.bookings.$get({
    query: compactQuery({
      q: query.q,
      status: query.status,
      paymentMethod: query.paymentMethod,
      invoiceStatus: query.invoiceStatus,
      from: query.from,
      to: query.to,
    }),
  });
  if (!res.ok) throw new ApiError(res.status, 'Failed to load reservations');
  return res.json();
}

/** GET /admin/invoices — passenger invoices and payment attempts. */
export async function fetchAdminInvoices(query: AdminInvoiceQuery = {}): Promise<AdminInvoiceRow[]> {
  const res = await api.admin.invoices.$get({
    query: compactQuery({
      q: query.q,
      status: query.status,
      paymentStatus: query.paymentStatus,
      from: query.from,
      to: query.to,
    }),
  });
  if (!res.ok) throw new ApiError(res.status, 'Failed to load invoices');
  return res.json();
}

/** GET /admin/payouts — driver fare payouts awaiting a manual transfer. */
export async function fetchAdminPayouts(status?: DriverPayoutStatus): Promise<DriverPayout[]> {
  const res = await api.admin.payouts.$get({ query: status ? { status } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Failed to load payouts');
  return res.json();
}

/** POST /admin/payouts/:id/paid — record a manual payout. */
export async function markAdminPayoutPaid(id: string, ref: string): Promise<DriverPayout> {
  const res = await api.admin.payouts[':id'].paid.$post({
    param: { id },
    json: { ref },
  });
  if (!res.ok) throw new ApiError(res.status, 'Failed to mark payout paid');
  return res.json();
}

/** GET /admin/payments/incidents */
export async function fetchAdminIncidents(status?: 'open' | 'resolved'): Promise<ReconciliationMismatch[]> {
  const res = await api.admin.payments.incidents.$get({ query: status ? { status } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Failed to load incidents');
  return res.json();
}

/** POST /admin/payments/incidents/:id/resolve */
export async function resolveAdminIncident(id: string, note?: string): Promise<ReconciliationMismatch> {
  const res = await api.admin.payments.incidents[':id'].resolve.$post({
    param: { id },
    json: note ? { note } : {},
  });
  if (!res.ok) throw new ApiError(res.status, 'Failed to resolve incident');
  return res.json();
}
