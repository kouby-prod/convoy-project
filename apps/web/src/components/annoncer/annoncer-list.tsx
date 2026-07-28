'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createApiClient } from '@carpool/api-client';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const annoncerFormSchema = z.object({
  departureCity: z.string().trim().min(1, 'required'),
  destinationCity: z.string().trim().min(1, 'required'),
  departureDateTime: z.string().min(1, 'required'),
  seatsTotal: z.coerce.number().int().min(1, 'seatsMin'),
  pricePerSeat: z.coerce.number().nonnegative('priceMin'),
  comfort: z.enum(['standard', 'confort', 'premium']),
  baggageAllowance: z.string().max(500).optional(),
  description: z.string().max(1000).optional(),
});

type AnnoncerFormValues = z.infer<typeof annoncerFormSchema>;

function firstError(errors: FieldErrors<AnnoncerFormValues>, name: keyof AnnoncerFormValues) {
  const message = errors[name]?.message;
  return typeof message === 'string' ? message : null;
}

export function AnnoncerList() {
  const t = useTranslations('Annoncer');
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSessionPending && !session?.user) {
      router.push('/sign-in');
    }
  }, [isSessionPending, router, session?.user]);

  const formSchemaResolver = useMemo(
    () => zodResolver(annoncerFormSchema) as Resolver<AnnoncerFormValues>,
    [],
  );

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    reset,
    setError,
  } = useForm<AnnoncerFormValues>({
    resolver: formSchemaResolver,
    defaultValues: {
      departureCity: '',
      destinationCity: '',
      departureDateTime: '',
      seatsTotal: 1,
      pricePerSeat: 0,
      comfort: 'standard',
      baggageAllowance: '',
      description: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: AnnoncerFormValues) => {
      const response = await api.trajets.$post({
        json: {
          departureCity: data.departureCity,
          destinationCity: data.destinationCity,
          departureDateTime: new Date(data.departureDateTime).toISOString(),
          seatsTotal: data.seatsTotal,
          pricePerSeat: data.pricePerSeat,
          comfort: data.comfort,
          baggageAllowance: data.baggageAllowance || undefined,
          description: data.description || undefined,
        },
      });

      if (!response.ok) {
        throw new Error(t('form.errors.apiError'));
      }

      return response.json();
    },
    onSuccess: (data) => {
      setApiError(null);
      setSuccessMessage(t('form.success'));
      reset();
      router.push(`/trajets/${data.id}`);
    },
    onError: (error) => {
      setSuccessMessage(null);
      setApiError(error instanceof Error ? error.message : t('form.errors.apiError'));
    },
  });

  function errorText(name: keyof AnnoncerFormValues) {
    const key = firstError(errors, name);
    return key ? t(`form.errors.${key}`) : null;
  }

  function onSubmit(values: AnnoncerFormValues) {
    setApiError(null);

    if (values.departureCity.trim().toLowerCase() === values.destinationCity.trim().toLowerCase()) {
      setError('destinationCity', {
        type: 'manual',
        message: 'sameCities',
      });
      return;
    }

    const selectedDate = new Date(values.departureDateTime);
    if (Number.isNaN(selectedDate.getTime()) || selectedDate <= new Date()) {
      setError('departureDateTime', {
        type: 'manual',
        message: 'pastDate',
      });
      return;
    }

    mutation.mutate(values);
  }

  if (isSessionPending || !session?.user) {
    return <p className="text-muted-foreground">{t('loading')}</p>;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {successMessage && (
          <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
            {successMessage}
          </div>
        )}
        {apiError && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="departureCity" className="text-sm font-medium">
                {t('form.departureCity')}
              </label>
              <Input
                id="departureCity"
                {...register('departureCity')}
                placeholder={t('form.departureCityPlaceholder')}
              />
              {errorText('departureCity') && (
                <p className="text-sm text-destructive">{errorText('departureCity')}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="destinationCity" className="text-sm font-medium">
                {t('form.destinationCity')}
              </label>
              <Input
                id="destinationCity"
                {...register('destinationCity')}
                placeholder={t('form.destinationCityPlaceholder')}
              />
              {errorText('destinationCity') && (
                <p className="text-sm text-destructive">{errorText('destinationCity')}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="departureDateTime" className="text-sm font-medium">
              {t('form.departureDateTime')}
            </label>
            <Input
              id="departureDateTime"
              type="datetime-local"
              {...register('departureDateTime')}
            />
            {errorText('departureDateTime') && (
              <p className="text-sm text-destructive">{errorText('departureDateTime')}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="seatsTotal" className="text-sm font-medium">
                {t('form.seatsTotal')}
              </label>
              <Input
                id="seatsTotal"
                type="number"
                min="1"
                {...register('seatsTotal', { valueAsNumber: true })}
                placeholder={t('form.seatsTotalPlaceholder')}
              />
              {errorText('seatsTotal') && (
                <p className="text-sm text-destructive">{errorText('seatsTotal')}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="pricePerSeat" className="text-sm font-medium">
                {t('form.pricePerSeat')}
              </label>
              <Input
                id="pricePerSeat"
                type="number"
                min="0"
                step="0.01"
                {...register('pricePerSeat', { valueAsNumber: true })}
                placeholder={t('form.pricePerSeatPlaceholder')}
              />
              {errorText('pricePerSeat') && (
                <p className="text-sm text-destructive">{errorText('pricePerSeat')}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('form.comfort')}</label>
              <Controller
                name="comfort"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">{t('form.comfortStandard')}</SelectItem>
                      <SelectItem value="confort">{t('form.comfortConfort')}</SelectItem>
                      <SelectItem value="premium">{t('form.comfortPremium')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="baggageAllowance" className="text-sm font-medium">
                {t('form.baggageAllowance')}
              </label>
              <Input
                id="baggageAllowance"
                {...register('baggageAllowance')}
                placeholder={t('form.baggageAllowancePlaceholder')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              {t('form.description')}
            </label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder={t('form.descriptionPlaceholder')}
            />
            {errorText('description') && (
              <p className="text-sm text-destructive">{errorText('description')}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? t('form.submitting') : t('form.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
