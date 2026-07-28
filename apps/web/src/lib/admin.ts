import type {
  AdminDocument,
  AdminDocumentQuery,
  AdminStats,
  AdminUser,
  DocumentStatus,
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
}

/** PATCH /admin/documents/:id — approve or reject one submission. */
export async function reviewDocument({ id, status, note }: ReviewInput): Promise<AdminDocument> {
  const res = await api.admin.documents[':id'].$patch({
    param: { id },
    json: { status, note: note ? note : null },
  });
  if (!res.ok) throw new ApiError(res.status, 'Failed to record the decision');
  return res.json();
}

/** GET /admin/users — accounts with their document tallies, newest first. */
export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await api.admin.users.$get();
  if (!res.ok) throw new ApiError(res.status, 'Failed to load accounts');
  return res.json();
}
