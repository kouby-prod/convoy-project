'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { SavedPaymentMethod } from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from '@/lib/env';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { CardSkeleton } from '@/components/ui/list-skeleton';
import { toast } from '@/components/ui/toast';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);
const stripePromise = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;
const METHODS_KEY = ['payment-methods'] as const;

export function SavedCardsForm() {
  const t = useTranslations('Parametres.cards');
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const query = useQuery({
    queryKey: METHODS_KEY,
    queryFn: async () => {
      const res = await api.payments.methods.$get();
      if (!res.ok) throw new Error('Failed to load cards');
      return res.json();
    },
    enabled: Boolean(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.payments.methods[':id'].$delete({ param: { id } });
      if (!res.ok) throw new Error('Failed to remove card');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(METHODS_KEY, data);
      toast(t('removed'));
    },
  });

  const makeDefault = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.payments.methods[':id'].default.$put({ param: { id } });
      if (!res.ok) throw new Error('Failed to set default card');
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: METHODS_KEY });
      toast(t('defaulted'));
    },
  });

  if (!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || !stripePromise) return null;
  if (query.isLoading) return <CardSkeleton rows={3} label={t('loading')} />;
  if (query.data && query.data.configured === false) return null;

  const items = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {query.error || remove.error || makeDefault.error ? <FormAlert>{t('error')}</FormAlert> : null}
        {items.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="grid gap-2">
            {items.map((card) => (
              <li
                key={card.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 ring-1 ring-border"
              >
                <div className="text-sm">
                  <p className="font-medium capitalize">
                    {card.brand} ···· {card.last4}
                    {card.isDefault ? (
                      <span className="ml-2 text-xs font-semibold text-muted-foreground">{t('default')}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('expires', { month: String(card.expMonth).padStart(2, '0'), year: String(card.expYear) })}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!card.isDefault ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={makeDefault.isPending}
                      onClick={() => makeDefault.mutate(card.id)}
                    >
                      {t('setDefault')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(card.id)}
                  >
                    {t('remove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <AddCardPanel
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              void queryClient.invalidateQueries({ queryKey: METHODS_KEY });
              toast(t('saved'));
            }}
          />
        ) : (
          <Button type="button" variant="outline" className="w-fit" onClick={() => setAdding(true)}>
            {t('add')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AddCardPanel({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const t = useTranslations('Parametres.cards');
  const locale = useLocale();
  const query = useQuery({
    queryKey: ['payment-methods', 'setup'],
    queryFn: async () => {
      const res = await api.payments.methods.setup.$post();
      if (!res.ok) throw new Error('Failed to start card setup');
      return res.json();
    },
  });

  if (query.isLoading) return <CardSkeleton rows={2} label={t('loading')} />;
  if (query.error || !query.data?.clientSecret || !stripePromise) {
    return <FormAlert>{t('error')}</FormAlert>;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: query.data.clientSecret,
        appearance: { theme: 'stripe' },
        locale: locale === 'en' ? 'en-CA' : 'fr-CA',
      }}
    >
      <AddCardForm onCancel={onCancel} onSaved={onSaved} />
    </Elements>
  );
}

function AddCardForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const t = useTranslations('Parametres.cards');
  const stripe = useStripe();
  const elements = useElements();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setPending(true);
    setError(null);
    const result = await stripe.confirmSetup({ elements, redirect: 'if_required' });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? t('error'));
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <PaymentElement options={{ defaultValues: { billingDetails: { address: { country: 'CA' } } } }} />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={!stripe || pending}>
          {pending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}

export type { SavedPaymentMethod };
