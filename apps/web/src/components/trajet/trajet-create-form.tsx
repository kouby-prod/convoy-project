'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import {
  CreateTrajetRequestSchema,
  PAYMENT_AMENITIES,
  TRAJET_AMENITIES,
  type CreateTrajetRequest,
  type TrajetAmenity,
} from '@carpool/schemas';
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
import { PublishChecklistStep } from '@/components/trajet/publish-checklist';
import { VehicleForm } from '@/components/trajet/vehicle-form';
import { createTrajet } from '@/lib/trajets';
import { fetchMyVehicle } from '@/lib/vehicles';
import { cn } from '@/lib/utils';

type Step = 'ride-vehicle' | 'license-insurance';
const STEPS: Step[] = ['ride-vehicle', 'license-insurance'];

/** Everything but the payment methods, which get their own toggle group below. */
const GENERAL_AMENITIES = TRAJET_AMENITIES.filter(
  (amenity) => !(PAYMENT_AMENITIES as readonly TrajetAmenity[]).includes(amenity),
);

/**
 * Publish-a-ride form, two pages: (1) ride details + vehicle description,
 * (2) licence verification + insurance declaration. Both pages stay mounted
 * (toggled with `hidden`, not conditional rendering) so each page's own
 * state survives the driver going back and forth.
 *
 * Page 1 is a single native `<form>` for the ride fields (native
 * required-field validation), with `VehicleForm` — itself its own `<form>`,
 * hence a sibling rather than nested — rendered inside it. Its "Suivant" is
 * the ride form's submit button: it validates the ride fields AND requires
 * the vehicle to already be saved (`VehicleForm`'s own button, gated
 * separately) before advancing.
 *
 * Page 2 is `PublishChecklistStep` — a two-item checklist (licence number
 * on file, insurance declared "oui") rather than a re-run of `/mes-documents`'
 * full verification flow. Its "Publier" is the one action that actually
 * creates the ride, and only fires once both checklist items are satisfied.
 */
export function TrajetCreateForm() {
  const t = useTranslations('Trajet');
  const router = useRouter();
  const queryClient = useQueryClient();
  // POST /trajets is authenticated — without a session the request can only
  // ever 401, so prompt for sign-in instead of showing a form that fails.
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  const [step, setStep] = useState<Step>('ride-vehicle');
  const [ridePayload, setRidePayload] = useState<CreateTrajetRequest | null>(null);
  const [amenities, setAmenities] = useState<TrajetAmenity[]>([]);
  const [hasIntermediateStop, setHasIntermediateStop] = useState(false);
  // Radix Select is controlled, so comfort lives in state rather than FormData
  // — same as the amenity toggles and the stop checkbox above.
  const [comfort, setComfort] = useState<'standard' | 'confort' | 'premium'>('standard');
  const [departureCity, setDepartureCity] = useState('');
  const [arrivalCity, setArrivalCity] = useState('');
  const [error, setError] = useState('');

  // Shares the `['my-vehicle']` cache with `VehicleForm`/`PublishChecklistStep`
  // — read here only to gate Page 1's "Suivant" on a vehicle actually existing.
  const vehicleQuery = useQuery({ queryKey: ['my-vehicle'], queryFn: fetchMyVehicle });

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

  /**
   * Page 1's submit: validates the ride fields, then requires the vehicle to
   * already be saved (via `VehicleForm`'s own button, above) before moving on
   * to Page 2. Nothing is posted yet — the ride itself is only created from
   * Page 2's "Publier".
   */
  function handleStep1Submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const formData = new FormData(event.currentTarget);
    const date = formData.get('date')?.toString() ?? '';
    const departureTime = formData.get('departureTime')?.toString() ?? '';
    const arrivalTime = formData.get('arrivalTime')?.toString() ?? '';

    const departureAt = combine(date, departureTime);
    // Optional: null when the driver leaves it blank, same as arrivalPlace.
    const arrivalAt = combine(date, arrivalTime);

    if (!departureAt) {
      setError(t('create.invalid'));
      return;
    }

    // An arrival earlier than the departure means the ride lands the next day.
    if (arrivalAt && arrivalAt < departureAt) arrivalAt.setDate(arrivalAt.getDate() + 1);

    const parsed = CreateTrajetRequestSchema.safeParse({
      departureCity: departureCity.trim(),
      departurePlace: formData.get('departurePlace')?.toString() ?? '',
      arrivalCity: arrivalCity.trim(),
      arrivalPlace: formData.get('arrivalPlace')?.toString() ?? '',
      departureAt: departureAt.toISOString(),
      arrivalAt: arrivalAt ? arrivalAt.toISOString() : null,
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

    if (!vehicleQuery.data) {
      setError(t('create.step1.vehicleRequired'));
      return;
    }

    setRidePayload(parsed.data);
    setStep('license-insurance');
  }

  /**
   * Page 2's "Publier": fires once both checklist items are satisfied (see
   * `PublishChecklistStep`'s `onPublish`). Creates the ride regardless of the
   * driver's licence-verification status — that only ever gates the
   * "Vérifié"/"Non vérifié" badge, never trip creation.
   */
  function handlePublish() {
    if (!ridePayload) {
      setStep('ride-vehicle');
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

  const stepLabels: Record<Step, string> = {
    'ride-vehicle': t('create.step1.label'),
    'license-insurance': t('create.step2.label'),
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardContent className="p-6 pt-6 sm:p-8 sm:pt-8">
        <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {STEPS.map((entry, index) => (
            <span key={entry} className="flex items-center gap-2">
              {index > 0 ? <ArrowRight className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden /> : null}
              <span className={step === entry ? 'text-primary' : undefined}>{stepLabels[entry]}</span>
            </span>
          ))}
        </div>

        <div className={cn('flex flex-col gap-6', step !== 'ride-vehicle' && 'hidden')}>
          <form id="ride-details-form" onSubmit={handleStep1Submit} className="flex flex-col gap-6">
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
                  <Input type="time" id="create-arrival-time" name="arrivalTime" />
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

            <Field label={t('create.paymentMethods')}>
              <AmenityToggleGroup
                selected={amenities}
                onToggle={toggleAmenity}
                label={(amenity) => t(`amenities.${amenity}`)}
                legend={t('create.paymentMethods')}
                amenities={PAYMENT_AMENITIES}
              />
            </Field>

            <Field label={t('create.options')}>
              <AmenityToggleGroup
                selected={amenities}
                onToggle={toggleAmenity}
                label={(amenity) => t(`amenities.${amenity}`)}
                legend={t('filters.amenitiesLegend')}
                amenities={GENERAL_AMENITIES}
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
          </form>

          {/* Sibling, not nested — `VehicleForm` is its own `<form>`, and forms
              cannot nest. Its submit button stays independent; the outer
              "Suivant" below is linked to `ride-details-form` via `form=`
              rather than being inside it. */}
          <VehicleForm />
          {!vehicleQuery.data ? (
            <p className="text-center text-xs text-muted-foreground">{t('create.step3.saveHint')}</p>
          ) : null}

          {step === 'ride-vehicle' && error ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-center">
            <Button type="button" variant="outline" size="lg" onClick={() => router.push('/trajet')}>
              {t('create.step2.back')}
            </Button>
            <Button type="submit" form="ride-details-form" variant="primary" size="lg" className="px-10">
              {t('create.step1.next')}
              <ArrowRight className="size-5" strokeWidth={2.25} />
            </Button>
          </div>
        </div>

        <div className={cn('flex flex-col gap-6', step !== 'license-insurance' && 'hidden')}>
          {step === 'license-insurance' && error ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <PublishChecklistStep
            onPublish={handlePublish}
            onBack={() => setStep('ride-vehicle')}
            publishing={mutation.isPending}
          />
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
