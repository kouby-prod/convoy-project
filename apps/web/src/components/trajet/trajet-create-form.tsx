'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { CreateTrajetRequestSchema, type TrajetAmenity } from '@carpool/schemas';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CityCombobox } from '@/components/ui/city-combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LabelledField } from '@/components/ui/labelled-field';
import { AmenityToggleGroup } from '@/components/trajet/trajet-amenities';
import { createTrajet } from '@/lib/trajets';

/* Publish-a-ride form. Deliberately one screen: route, when, seats/price, then
   the options a passenger filters on. */
export function TrajetCreateForm() {
  const t = useTranslations('Trajet');
  const router = useRouter();
  const queryClient = useQueryClient();
  // POST /trajets is authenticated — without a session the request can only
  // ever 401, so prompt for sign-in instead of showing a form that fails.
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  const [amenities, setAmenities] = useState<TrajetAmenity[]>([]);
  const [hasIntermediateStop, setHasIntermediateStop] = useState(false);
  // Radix Select is controlled, so comfort lives in state rather than FormData
  // — same as the amenity toggles and the stop checkbox above.
  const [comfort, setComfort] = useState<'standard' | 'confort' | 'premium'>('standard');
  const [departureCity, setDepartureCity] = useState('');
  const [arrivalCity, setArrivalCity] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: createTrajet,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['trajet'] });
      queryClient.invalidateQueries({ queryKey: ['trajets', created.id] });
      router.push(`/trajet/${created.id}`);
    },
    onError: () => setError(t('create.failed')),
  });

  function toggleAmenity(amenity: TrajetAmenity) {
    setAmenities((current) =>
      current.includes(amenity)
        ? current.filter((entry) => entry !== amenity)
        : [...current, amenity],
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const formData = new FormData(event.currentTarget);
    const date = formData.get('date')?.toString() ?? '';
    const departureTime = formData.get('departureTime')?.toString() ?? '';
    const arrivalTime = formData.get('arrivalTime')?.toString() ?? '';

    const departureAt = combine(date, departureTime);
    const arrivalAt = combine(date, arrivalTime);

    if (!departureAt || !arrivalAt) {
      setError(t('create.invalid'));
      return;
    }

    // An arrival earlier than the departure means the ride lands the next day.
    if (arrivalAt < departureAt) arrivalAt.setDate(arrivalAt.getDate() + 1);

    const parsed = CreateTrajetRequestSchema.safeParse({
      departureCity: departureCity.trim(),
      departurePlace: formData.get('departurePlace')?.toString() ?? '',
      arrivalCity: arrivalCity.trim(),
      arrivalPlace: formData.get('arrivalPlace')?.toString() ?? '',
      departureAt: departureAt.toISOString(),
      arrivalAt: arrivalAt.toISOString(),
      pricePerSeat: Number(formData.get('pricePerSeat')),
      seatsTotal: Number(formData.get('seatsTotal')),
      amenities,
      hasIntermediateStop,
      description: formData.get('description')?.toString() ?? '',
      comfort,
      baggageAllowance: formData.get('baggageAllowance')?.toString() ?? '',
    });

    if (!parsed.success) {
      setError(t('create.invalid'));
      return;
    }

    mutation.mutate(parsed.data);
  }

  if (!isSessionPending && !session?.user) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 pt-8 text-center">
          <p className="text-sm text-muted-foreground">{t('authRequired')}</p>
          <Link href="/sign-in" className="text-sm font-semibold text-primary hover:underline">
            {t('authCta')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardContent className="p-6 pt-6 sm:p-8 sm:pt-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <Field label={t('create.departure')}>
            <CityCombobox
              name="departureCity"
              value={departureCity}
              onChange={setDepartureCity}
              placeholder={t('filters.from')}
              aria-label={t('filters.from')}
              required
            />
            <Input name="departurePlace" placeholder={t('create.departurePlace')} required />
          </Field>

          <Field label={t('create.arrival')}>
            <CityCombobox
              name="arrivalCity"
              value={arrivalCity}
              onChange={setArrivalCity}
              placeholder={t('filters.to')}
              aria-label={t('filters.to')}
              required
            />
            <Input name="arrivalPlace" placeholder={t('create.arrivalPlace')} required />
          </Field>

          <Field label={t('create.when')}>
            <LabelledField label={t('filters.date')} htmlFor="create-date">
              <Input type="date" id="create-date" name="date" required />
            </LabelledField>
            <div className="grid grid-cols-2 gap-3">
              <LabelledField label={t('create.departureTime')} htmlFor="create-departure-time">
                <Input type="time" id="create-departure-time" name="departureTime" required />
              </LabelledField>
              <LabelledField label={t('create.arrivalTime')} htmlFor="create-arrival-time">
                <Input type="time" id="create-arrival-time" name="arrivalTime" required />
              </LabelledField>
            </div>
            <p className="text-xs text-muted-foreground">{t('create.timesHint')}</p>
          </Field>

          <Field label={t('create.seatsAndPrice')}>
            <div className="grid grid-cols-2 gap-3">
              <LabelledField label={t('create.seatsTotal')} htmlFor="create-seats">
                <Input
                  type="number"
                  id="create-seats"
                  name="seatsTotal"
                  min={1}
                  max={8}
                  defaultValue={2}
                  required
                />
              </LabelledField>
              <LabelledField label={t('create.pricePerSeat')} htmlFor="create-price">
                <Input
                  type="number"
                  id="create-price"
                  name="pricePerSeat"
                  min={0}
                  step="0.5"
                  required
                />
              </LabelledField>
            </div>
          </Field>

          <Field label={t('comfort.legend')}>
            <Select value={comfort} onValueChange={(value) => setComfort(value as typeof comfort)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">{t('comfort.standard')}</SelectItem>
                <SelectItem value="confort">{t('comfort.confort')}</SelectItem>
                <SelectItem value="premium">{t('comfort.premium')}</SelectItem>
              </SelectContent>
            </Select>
            <LabelledField label={t('create.baggage')} htmlFor="create-baggage">
              <Input
                id="create-baggage"
                name="baggageAllowance"
                maxLength={500}
                placeholder={t('create.baggagePlaceholder')}
              />
            </LabelledField>
          </Field>

          <Field label={t('create.options')}>
            <AmenityToggleGroup
              selected={amenities}
              onToggle={toggleAmenity}
              label={(amenity) => t(`amenities.${amenity}`)}
              legend={t('filters.amenitiesLegend')}
            />
            <Checkbox
              name="hasIntermediateStop"
              checked={hasIntermediateStop}
              onChange={(event) => setHasIntermediateStop(event.target.checked)}
              label={t('create.intermediateStop')}
            />
          </Field>

          <Field label={t('create.description')}>
            <Textarea
              name="description"
              maxLength={500}
              placeholder={t('create.descriptionPlaceholder')}
            />
          </Field>

          {error ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="px-10"
              disabled={mutation.isPending}
            >
              <Send className="size-5" strokeWidth={2.25} />
              {mutation.isPending ? t('create.submitting') : t('create.submit')}
            </Button>
            <Link href="/trajet" className="text-sm font-semibold text-primary hover:underline">
              {t('booking.back')}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** A labelled group of related inputs. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-sm font-semibold text-foreground">{label}</legend>
      {children}
    </fieldset>
  );
}

/** `YYYY-MM-DD` + `HH:MM` → a local Date, or null when either half is missing. */
function combine(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
