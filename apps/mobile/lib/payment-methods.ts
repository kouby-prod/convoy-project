import type { SavedPaymentMethod, SavedPaymentMethodList, SetupIntentResponse } from '@carpool/schemas';
import { api } from './api-client';

/** GET /payments/methods — the signed-in passenger's saved cards (Stripe only; `configured: false` means no Stripe customer yet). */
export async function fetchSavedPaymentMethods(): Promise<SavedPaymentMethodList> {
  const res = await api.payments.methods.$get();
  if (!res.ok) throw new Error('Failed to load cards');
  return res.json();
}

/** POST /payments/methods/setup — a SetupIntent client secret for adding a new card via the PaymentSheet. */
export async function createSetupIntent(): Promise<SetupIntentResponse> {
  const res = await api.payments.methods.setup.$post();
  if (!res.ok) throw new Error('Failed to start card setup');
  return res.json();
}

/** DELETE /payments/methods/:id */
export async function removePaymentMethod(id: string): Promise<SavedPaymentMethodList> {
  const res = await api.payments.methods[':id'].$delete({ param: { id } });
  if (!res.ok) throw new Error('Failed to remove card');
  return res.json();
}

/** PUT /payments/methods/:id/default — returns just the updated card, not the whole list. */
export async function setDefaultPaymentMethod(id: string): Promise<SavedPaymentMethod> {
  const res = await api.payments.methods[':id'].default.$put({ param: { id } });
  if (!res.ok) throw new Error('Failed to set default card');
  return res.json();
}
