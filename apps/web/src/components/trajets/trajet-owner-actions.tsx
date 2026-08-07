'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Controller, useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createApiClient } from '@carpool/api-client';
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
import type { Trajet } from '@carpool/schemas';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const editFormSchema = z.object({
  departureCity: z.string().trim().min(1, 'required'),
  destinationCity: z.string().trim().min(1, 'required'),
  departureDateTime: z.string().min(1, 'required'),
  seatsTotal: z.coerce.number().int().min(1, 'seatsMin'),
  pricePerSeat: z.coerce.number().nonnegative('priceMin'),
  comfort: z.enum(['standard', 'confort', 'premium']),
  baggageAllowance: z.string().max(500).optional(),
  description: z.string().max(1000).optional(),
});

type EditFormValues = z.infer<typeof editFormSchema>;

/** `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm" in local time. */
function toDatetimeLocal(iso: string) {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function firstError(errors: FieldErrors<EditFormValues>, name: keyof EditFormValues) {
  const message = errors[name]?.message;
  return typeof message === 'string' ? message : null;
}

/**
 * Driver-only edit/cancel controls for a published trajet. Rendered by
 * `TrajetDetail` alongside `TrajetBookings` when the signed-in user is the
 * trajet's driver — backs onto `PATCH /trajets/:id` and the soft-cancelling
 * `DELETE /trajets/:id`. Field labels are borrowed from the `Annoncer`
 * namespace (same create form) rather than duplicated.
 */
export function TrajetOwnerActions({ trajet }: { trajet: Trajet }) {
  const t = useTranslations('Trajets');
  const tForm = useTranslations('Annoncer');
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const formSchemaResolver = useMemo(() => zodResolver(editFormSchema) as Resolver<EditFormValues>, []);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<EditFormValues>({
    resolver: formSchemaResolver,
    defaultValues: {
      departureCity: trajet.departureCity,
      destinationCity: trajet.destinationCity,
      departureDateTime: toDatetimeLocal(trajet.departureDateTime),
      seatsTotal: trajet.seatsTotal,
      pricePerSeat: trajet.pricePerSeat,
      comfort: trajet.comfort ?? 'standard',
      baggageAllowance: trajet.baggageAllowance ?? '',
      description: trajet.description ?? '',
    },
  });

  function invalidateTrajetQueries() {
    queryClient.invalidateQueries({ queryKey: ['trajets', trajet.id] });
    queryClient.invalidateQueries({ queryKey: ['me', 'trajets'] });
  }

  const updateMutation = useMutation({
    mutationFn: async (data: EditFormValues) => {
      const res = await api.trajets[':id'].$patch({
        param: { id: trajet.id },
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
      if (!res.ok) throw new Error(t('owner.updateError'));
      return res.json();
    },
    onSuccess: () => {
      setApiError(null);
      setIsEditing(false);
      invalidateTrajetQueries();
    },
    onError: (error) => {
      setApiError(error instanceof Error ? error.message : t('owner.updateError'));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await api.trajets[':id'].$delete({ param: { id: trajet.id } });
      if (!res.ok) throw new Error(t('owner.cancelError'));
      return res.json();
    },
    onSuccess: () => {
      setConfirmingCancel(false);
      invalidateTrajetQueries();
    },
  });

  function errorText(name: keyof EditFormValues) {
    const key = firstError(errors, name);
    return key ? tForm(`form.errors.${key}`) : null;
  }

  function onSubmit(values: EditFormValues) {
    setApiError(null);

    if (values.departureCity.trim().toLowerCase() === values.destinationCity.trim().toLowerCase()) {
      setError('destinationCity', { type: 'manual', message: 'sameCities' });
      return;
    }
    const selectedDate = new Date(values.departureDateTime);
    if (Number.isNaN(selectedDate.getTime()) || selectedDate <= new Date()) {
      setError('departureDateTime', { type: 'manual', message: 'pastDate' });
      return;
    }
    updateMutation.mutate(values);
  }

  if (trajet.cancelledAt) return null;

  if (!isEditing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          {t('owner.edit')}
        </Button>
        {!confirmingCancel ? (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmingCancel(true)}
          >
            {t('owner.cancelTrajet')}
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('owner.confirmPrompt')}</span>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? t('owner.cancelling') : t('owner.confirmYes')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(false)}>
              {t('owner.confirmNo')}
            </Button>
          </div>
        )}
        {cancelMutation.isError ? (
          <p className="w-full text-sm text-destructive">{t('owner.cancelError')}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 rounded-lg border p-4">
      {apiError ? <p className="text-sm text-destructive">{apiError}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="editDepartureCity" className="text-sm font-medium">
            {tForm('form.departureCity')}
          </label>
          <Input id="editDepartureCity" {...register('departureCity')} />
          {errorText('departureCity') && (
            <p className="text-sm text-destructive">{errorText('departureCity')}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="editDestinationCity" className="text-sm font-medium">
            {tForm('form.destinationCity')}
          </label>
          <Input id="editDestinationCity" {...register('destinationCity')} />
          {errorText('destinationCity') && (
            <p className="text-sm text-destructive">{errorText('destinationCity')}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="editDepartureDateTime" className="text-sm font-medium">
          {tForm('form.departureDateTime')}
        </label>
        <Input id="editDepartureDateTime" type="datetime-local" {...register('departureDateTime')} />
        {errorText('departureDateTime') && (
          <p className="text-sm text-destructive">{errorText('departureDateTime')}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="editSeatsTotal" className="text-sm font-medium">
            {tForm('form.seatsTotal')}
          </label>
          <Input
            id="editSeatsTotal"
            type="number"
            min="1"
            {...register('seatsTotal', { valueAsNumber: true })}
          />
          {errorText('seatsTotal') && (
            <p className="text-sm text-destructive">{errorText('seatsTotal')}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="editPricePerSeat" className="text-sm font-medium">
            {tForm('form.pricePerSeat')}
          </label>
          <Input
            id="editPricePerSeat"
            type="number"
            min="0"
            step="0.01"
            {...register('pricePerSeat', { valueAsNumber: true })}
          />
          {errorText('pricePerSeat') && (
            <p className="text-sm text-destructive">{errorText('pricePerSeat')}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">{tForm('form.comfort')}</label>
          <Controller
            name="comfort"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">{tForm('form.comfortStandard')}</SelectItem>
                  <SelectItem value="confort">{tForm('form.comfortConfort')}</SelectItem>
                  <SelectItem value="premium">{tForm('form.comfortPremium')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="editBaggageAllowance" className="text-sm font-medium">
            {tForm('form.baggageAllowance')}
          </label>
          <Input id="editBaggageAllowance" {...register('baggageAllowance')} />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="editDescription" className="text-sm font-medium">
          {tForm('form.description')}
        </label>
        <Textarea id="editDescription" {...register('description')} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? t('owner.saving') : t('owner.save')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
          {t('owner.closeEdit')}
        </Button>
      </div>
    </form>
  );
}
