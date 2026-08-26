import { ACCOUNT_DELETION_RETENTION_DAYS, type AccountDeletionStatus } from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';
import { ApiError } from './api-error';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

export { ACCOUNT_DELETION_RETENTION_DAYS };
export type { AccountDeletionStatus };

export async function fetchAccountDeletion(): Promise<AccountDeletionStatus> {
  const res = await api.account.deletion.$get();
  if (!res.ok) throw new ApiError(res.status, 'Failed to load account deletion status');
  return res.json();
}

export async function scheduleAccountDeletion(password?: string): Promise<AccountDeletionStatus> {
  const res = await api.account.deletion.$post({ json: password ? { password } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Failed to schedule account deletion');
  return res.json();
}

export async function cancelAccountDeletion(): Promise<AccountDeletionStatus> {
  const res = await api.account.deletion.$delete();
  if (!res.ok) throw new ApiError(res.status, 'Failed to cancel account deletion');
  return res.json();
}
