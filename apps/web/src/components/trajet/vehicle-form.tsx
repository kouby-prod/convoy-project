'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Car, Check } from 'lucide-react';
import type { UpsertVehicle } from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LabelledField } from '@/components/ui/labelled-field';
import { fetchMyVehicle, saveMyVehicle } from '@/lib/vehicles';

/**
 * The car description a passenger sees on a ride, filled in on the ride
 * creation "Étape 2" screen. Saved on its own (`PUT /vehicles/me`), same as
 * each document slot — publishing the ride never waits on it.
 */
export function VehicleForm() {
  const t = useTranslations('Trajet');
  const queryClient = useQueryClient();

  const vehicleQuery = useQuery({ queryKey: ['my-vehicle'], queryFn: fetchMyVehicle });

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [seats, setSeats] = useState(4);
  const [plate, setPlate] = useState('');
  const [error, setError] = useState('');
  const [seeded, setSeeded] = useState(false);

  // Seed the form once the driver's existing vehicle (if any) has loaded.
  // Fields are controlled — needed for the numeric `seats` field and to
  // disable the button while saving — so `defaultValue` isn't an option.
  useEffect(() => {
    if (seeded || !vehicleQuery.data) return;
    setMake(vehicleQuery.data.make);
    setModel(vehicleQuery.data.model);
    setColor(vehicleQuery.data.color);
    setSeats(vehicleQuery.data.seats);
    setPlate(vehicleQuery.data.plate);
    setSeeded(true);
  }, [seeded, vehicleQuery.data]);

  const mutation = useMutation({
    mutationFn: saveMyVehicle,
    onSuccess: (saved) => {
      queryClient.setQueryData(['my-vehicle'], saved);
      setError('');
    },
    onError: () => setError(t('create.step2.vehicle.saveFailed')),
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const payload: UpsertVehicle = {
      make: make.trim(),
      model: model.trim(),
      color: color.trim(),
      seats,
      plate: plate.trim().toUpperCase(),
    };
    if (!payload.make || !payload.model || !payload.color || !payload.plate) {
      setError(t('create.step2.vehicle.required'));
      return;
    }
    mutation.mutate(payload);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 pt-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Car className="size-5" strokeWidth={2.25} aria-hidden />
          </span>
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">{t('create.step2.vehicle.title')}</h3>
            <p className="text-xs text-muted-foreground">{t('create.step2.vehicle.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <LabelledField label={t('create.step2.vehicle.make')} htmlFor="vehicle-make">
              <Input
                id="vehicle-make"
                value={make}
                onChange={(event) => setMake(event.target.value)}
                maxLength={100}
                required
              />
            </LabelledField>
            <LabelledField label={t('create.step2.vehicle.model')} htmlFor="vehicle-model">
              <Input
                id="vehicle-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                maxLength={100}
                required
              />
            </LabelledField>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <LabelledField label={t('create.step2.vehicle.color')} htmlFor="vehicle-color">
              <Input
                id="vehicle-color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                maxLength={50}
                required
              />
            </LabelledField>
            <LabelledField label={t('create.step2.vehicle.seats')} htmlFor="vehicle-seats">
              <Input
                id="vehicle-seats"
                type="number"
                min={1}
                max={8}
                value={seats}
                onChange={(event) => setSeats(Number(event.target.value))}
                required
              />
            </LabelledField>
            <LabelledField label={t('create.step2.vehicle.plate')} htmlFor="vehicle-plate">
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
              ? t('create.step2.vehicle.saving')
              : vehicleQuery.data
                ? t('create.step2.vehicle.update')
                : t('create.step2.vehicle.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
