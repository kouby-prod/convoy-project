'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Camera, Car, Check, UploadCloud } from 'lucide-react';
import type { UpsertVehicle } from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LabelledField } from '@/components/ui/labelled-field';
import { fetchMyVehicle, fetchVehiclePhotoUrl, saveMyVehicle, uploadMyVehiclePhoto } from '@/lib/vehicles';
import { isApiError } from '@/lib/api-error';

/**
 * The car description a passenger sees on a ride, filled in on the ride
 * creation "Étape 3" screen. Saved on its own (`PUT /vehicles/me`) via its own
 * button — `TrajetCreateForm` gates that step's "Suivant" on a vehicle
 * actually existing in the shared `['my-vehicle']` cache, so a driver cannot
 * skip past this screen without saving one.
 *
 * `plate` is the only mandatory field here — `make`/`model`/`color`/`seats`
 * and the photo are all optional, and are omitted from the ride card rather
 * than shown as invented data when left blank.
 */
export function VehicleForm() {
  const t = useTranslations('Trajet');
  const queryClient = useQueryClient();

  const vehicleQuery = useQuery({ queryKey: ['my-vehicle'], queryFn: fetchMyVehicle });
  const ownerId = vehicleQuery.data?.ownerId;
  const photoQuery = useQuery({
    queryKey: ['my-vehicle-photo', ownerId],
    queryFn: () => fetchVehiclePhotoUrl(ownerId!),
    enabled: !!vehicleQuery.data?.hasPhoto && !!ownerId,
  });

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [seats, setSeats] = useState('');
  const [plate, setPlate] = useState('');
  const [error, setError] = useState('');
  const [seeded, setSeeded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState('');

  // Seed the form once the driver's existing vehicle (if any) has loaded.
  // Fields are controlled — needed to disable the button while saving — so
  // `defaultValue` isn't an option.
  useEffect(() => {
    if (seeded || !vehicleQuery.data) return;
    setMake(vehicleQuery.data.make ?? '');
    setModel(vehicleQuery.data.model ?? '');
    setColor(vehicleQuery.data.color ?? '');
    setSeats(vehicleQuery.data.seats !== null ? String(vehicleQuery.data.seats) : '');
    setPlate(vehicleQuery.data.plate);
    setSeeded(true);
  }, [seeded, vehicleQuery.data]);

  const mutation = useMutation({
    mutationFn: saveMyVehicle,
    onSuccess: (saved) => {
      queryClient.setQueryData(['my-vehicle'], saved);
      setError('');
    },
    onError: () => setError(t('create.step3.vehicle.saveFailed')),
  });

  const photoMutation = useMutation({
    mutationFn: uploadMyVehiclePhoto,
    onSuccess: (saved) => {
      queryClient.setQueryData(['my-vehicle'], saved);
      queryClient.invalidateQueries({ queryKey: ['my-vehicle-photo'] });
      setPhotoError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (cause: unknown) => {
      setPhotoError(
        isApiError(cause, 413)
          ? t('create.step3.vehicle.photoTooLarge')
          : isApiError(cause, 415)
            ? t('create.step3.vehicle.photoUnsupported')
            : t('create.step3.vehicle.photoFailed'),
      );
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const trimmedPlate = plate.trim().toUpperCase();
    if (!trimmedPlate) {
      setError(t('create.step3.vehicle.required'));
      return;
    }

    const parsedSeats = seats.trim() ? Number(seats) : null;
    const payload: UpsertVehicle = {
      make: make.trim() || null,
      model: model.trim() || null,
      color: color.trim() || null,
      seats: parsedSeats,
      plate: trimmedPlate,
      // Insurance is declared on Étape 4, not here — preserve whatever is
      // already on file (or `null`, "not yet declared", for a new vehicle)
      // rather than resetting it every time the description is edited.
      hasInsurance: vehicleQuery.data?.hasInsurance ?? null,
    };
    mutation.mutate(payload);
  }

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError('');
    photoMutation.mutate(file);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 pt-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Car className="size-5" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">{t('create.step3.vehicle.title')}</h3>
            <p className="text-xs text-muted-foreground">{t('create.step3.vehicle.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <LabelledField label={t('create.step3.vehicle.make')} htmlFor="vehicle-make">
              <Input
                id="vehicle-make"
                value={make}
                onChange={(event) => setMake(event.target.value)}
                maxLength={100}
              />
            </LabelledField>
            <LabelledField label={t('create.step3.vehicle.model')} htmlFor="vehicle-model">
              <Input
                id="vehicle-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                maxLength={100}
              />
            </LabelledField>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <LabelledField label={t('create.step3.vehicle.color')} htmlFor="vehicle-color">
              <Input
                id="vehicle-color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                maxLength={50}
              />
            </LabelledField>
            <LabelledField label={t('create.step3.vehicle.seats')} htmlFor="vehicle-seats">
              <Input
                id="vehicle-seats"
                type="number"
                min={1}
                max={8}
                value={seats}
                onChange={(event) => setSeats(event.target.value)}
              />
            </LabelledField>
            <LabelledField label={t('create.step3.vehicle.plate')} htmlFor="vehicle-plate">
              <Input
                id="vehicle-plate"
                value={plate}
                onChange={(event) => setPlate(event.target.value)}
                maxLength={20}
                required
              />
            </LabelledField>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="outline" disabled={mutation.isPending} className="self-start">
            <Check className="size-4" strokeWidth={2.5} aria-hidden />
            {mutation.isPending
              ? t('create.step3.vehicle.saving')
              : vehicleQuery.data
                ? t('create.step3.vehicle.update')
                : t('create.step3.vehicle.save')}
          </Button>
        </form>

        {/* Optional photo — attaches to the vehicle saved above, so it only
            makes sense once that row exists. */}
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t('create.step3.vehicle.photoLabel')}
          </p>
          {photoQuery.data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoQuery.data}
              alt=""
              className="h-32 w-full max-w-xs rounded-md object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-foreground/5">
              <Camera className="size-6" strokeWidth={1.75} aria-hidden />
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id="vehicle-photo-input"
            onChange={handlePhotoChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={!vehicleQuery.data || photoMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="size-4" strokeWidth={2.5} aria-hidden />
            {photoMutation.isPending
              ? t('create.step3.vehicle.photoUploading')
              : photoQuery.data
                ? t('create.step3.vehicle.photoReplace')
                : t('create.step3.vehicle.photoAdd')}
          </Button>
          {!vehicleQuery.data ? (
            <p className="text-xs text-muted-foreground">{t('create.step3.vehicle.photoNeedsVehicle')}</p>
          ) : null}
          {photoError ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {photoError}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
