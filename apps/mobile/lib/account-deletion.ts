import type { AccountDeletionStatus } from '@carpool/schemas';
import { api } from './api-client';

export async function fetchAccountDeletion(): Promise<AccountDeletionStatus> {
  const res = await api.account.deletion.$get();
  if (!res.ok) throw new Error('Failed to load account deletion status');
  return res.json();
}

export async function scheduleAccountDeletion(password?: string): Promise<AccountDeletionStatus> {
  const res = await api.account.deletion.$post({ json: password ? { password } : {} });
  if (!res.ok) throw new Error('Failed to schedule account deletion');
  return res.json();
}

export async function cancelAccountDeletion(): Promise<AccountDeletionStatus> {
  const res = await api.account.deletion.$delete();
  if (!res.ok) throw new Error('Failed to cancel account deletion');
  return res.json();
}
