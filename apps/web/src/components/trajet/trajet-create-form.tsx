'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowRight, Send } from 'lucide-react';
import { CreateTrajetRequestSchema, type CreateTrajetRequest, type TrajetAmenity } from '@carpool/schemas';
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
import { RideVerificationStep } from '@/components/trajet/ride-verification-step';
import { VehicleForm } from '@/components/trajet/vehicle-form';
import { createTrajet } from '@/lib/trajets';
import { cn } from '@/lib/utils';

/**
 * Publish-a-ride form, two steps: ride details, then licence verification +
 * vehicle description + registration. Both steps stay mounted (toggled with
 * `hidden`, not conditional rendering) so Step 1's uncontrolled inputs keep
 * their values if the driver goes back from Step 2. Step 1 is its own
 * `<form>` — its "Suivant" button is a real submit, which gets native
 * required-field validation for free; Step 2 is a plain wrapper (not a
 * `<form>`) because it hosts the document/vehicle cards, which are each their
 * own `<form>` and would be invalid HTML nested inside another one. Step 2's
 * "Publier" therefore isn't a submit button — it fires the mutation directly
 * with the payload Step 1 already validated.
 */
export function TrajetCreateForm() {
  const t = useTranslations('Trajet');
  const router = useRouter();
  const queryClient = useQueryClient();
  // POST /trajets is authenticated — without a session the request can only
  // ever 401, so prompt for sign-in instead of showing a form that fails.
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  const [step, setStep] = useState<'ride' | 'verification'>('ride');
  const [ridePayload, setRidePayload] = useState<CreateTrajetRequest | null>(null);
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

  /** Step 1's submit: validate the ride fields, then move to Step 2 without posting anything yet. */
  function handleStep1Submit(event: React.FormEvent<HTMLFormElement>) {
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

    setRidePayload(parsed.data);
    setStep('verification');
  }

  /**
   * Step 2's "Publier": creates the ride regardless of the driver's
   * verification status — the ride is never blocked on it. An unverified (or
   * no-longer-fresh) driver's ride just stays out of public search until
   * their verification is approved (enforced server-side); it is created and
   * visible to them on "mes trajets" either way.
   */
  function handlePublish() {
    if (!ridePayload) {
      setStep('ride');
      return;
    }
    setError('');
    mutation.mutate(ridePayload);
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
        <div className="mb-6 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <span className={step === 'ride' ? 'text-primary' : undefined}>{t('create.step1.label')}</span>
          <ArrowRight className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
          <span className={step === 'verification' ? 'text-primary' : undefined}>
            {t('create.step2.label')}
          </span>
        </div>

        <form
          onSubmit={handleStep1Submit}
          className={cn('flex flex-col gap-6', step !== 'ride' && 'hidden')}
        >
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

          {step === 'ride' && error ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col items-center gap-3">
            <Button type="submit" variant="primary" size="lg" className="px-10">
              {t('create.step1.next')}
              <ArrowRight className="size-5" strokeWidth={2.25} />
            </Button>
            <Link href="/trajet" className="text-sm font-semibold text-primary hover:underline">
              {t('booking.back')}
            </Link>
          </div>
        </form>

        <div className={cn('flex flex-col gap-6', step !== 'verification' && 'hidden')}>
          <RideVerificationStep />
          <VehicleForm />

          {step === 'verification' && error ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-center">
            <Button type="button" variant="outline" size="lg" onClick={() => setStep('ride')}>
              {t('create.step2.back')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="px-10"
              disabled={mutation.isPending}
              onClick={handlePublish}
            >
              <Send className="size-5" strokeWidth={2.25} />
              {mutation.isPending ? t('create.submitting') : t('create.submit')}
            </Button>
          </div>
        </div>
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
