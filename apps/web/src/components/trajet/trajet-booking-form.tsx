'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { CreateBookingRequestSchema } from '@carpool/schemas';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { createBooking } from '@/lib/trajets';

interface TrajetBookingFormProps {
  trajetId: string;
  /** Rides with no seat left still render, but can't be booked. */
  seatsAvailable: number;
}

/* Seat reservation form on the ride detail page. Validates against the shared
   `CreateBookingRequest` contract before it ever hits the network. */
export function TrajetBookingForm({ trajetId, seatsAvailable }: TrajetBookingFormProps) {
  const t = useTranslations('Trajet');
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  // POST /trajets/:id/book is authenticated — without a session the request can
  // only ever 401, so prompt for sign-in instead of showing a form that fails.
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  const mutation = useMutation({
    mutationFn: createBooking,
    onSuccess: () => {
      // The ride's remaining seats changed — drop the cached result lists.
      queryClient.invalidateQueries({ queryKey: ['trajet'] });
    },
    onError: () => setError(t('booking.failed')),
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const formData = new FormData(event.currentTarget);
    const parsed = CreateBookingRequestSchema.safeParse({
      trajetId,
      lastName: formData.get('lastName')?.toString() ?? '',
      firstName: formData.get('firstName')?.toString() ?? '',
      email: formData.get('email')?.toString() ?? '',
      phone: formData.get('phone')?.toString() ?? '',
      message: formData.get('message')?.toString() ?? '',
    });

    if (!parsed.success) {
      setError(t('booking.invalid'));
      return;
    }

    mutation.mutate(parsed.data);
  }

  if (!isSessionPending && !session?.user) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 pt-8 text-center">
          <p className="text-sm text-muted-foreground">{t('authRequired')}</p>
          <Link
            href="/sign-in"
            className="text-sm font-semibold text-primary hover:underline"
          >
            {t('authCta')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (mutation.isSuccess) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 pt-8 text-center">
          <CheckCircle2 className="size-8 text-secondary" strokeWidth={2} aria-hidden />
          <p className="text-sm font-medium text-foreground">{t('booking.success')}</p>
          <Link href="/trajet" className="text-sm font-semibold text-primary hover:underline">
            {t('booking.back')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="p-6 pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            name="lastName"
            placeholder={t('booking.lastName')}
            required
            autoComplete="family-name"
          />
          <Input
            name="firstName"
            placeholder={t('booking.firstName')}
            required
            autoComplete="given-name"
          />
          <Input
            type="email"
            name="email"
            placeholder={t('booking.email')}
            required
            autoComplete="email"
          />
          <Input
            type="tel"
            name="phone"
            placeholder={t('booking.phone')}
            required
            autoComplete="tel"
          />

          <div className="space-y-2">
            <label htmlFor="booking-message" className="block text-sm text-muted-foreground">
              {t('booking.message')}
            </label>
            <Textarea id="booking-message" name="message" maxLength={500} />
          </div>

          {seatsAvailable === 0 ? (
            <p className="rounded-3xl bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
              {t('booking.full')}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-3xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="accent"
            size="lg"
            className="mx-auto flex px-10"
            disabled={mutation.isPending || seatsAvailable === 0}
          >
            {mutation.isPending ? t('booking.submitting') : t('booking.submit')}
          </Button>

          <p className="text-center">
            <Link href="/trajet" className="text-sm font-semibold text-primary hover:underline">
              {t('booking.back')}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
