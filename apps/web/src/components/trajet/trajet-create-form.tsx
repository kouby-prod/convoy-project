'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowRight, Car, Clock, MapPin, Sparkles, Wallet } from 'lucide-react';
import {
  CreateTrajetRequestSchema,
  RIDE_PAYMENT_METHODS,
  type CreateTrajetRequest,
  type RidePaymentMethod,
  type TrajetAmenity,
} from '@carpool/schemas';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { signInHref } from '@/lib/auth-urls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { LocationPicker, type LocationValue } from '@/components/ui/location-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LabelledField } from '@/components/ui/labelled-field';
import { FormAlert } from '@/components/ui/form-alert';
import { AmenityToggleGroup, GENERAL_AMENITIES } from '@/components/trajet/trajet-amenities';
import { DropdownDatePicker, dateToParam, paramToDate } from '@/components/ui/dropdown-date-picker';
import { DropdownTimePicker } from '@/components/ui/dropdown-time-picker';
import { formatTime, parseTime } from '@/components/ui/time-picker';
import { PublishChecklistStep } from '@/components/trajet/publish-checklist';
import { VehicleForm } from '@/components/trajet/vehicle-form';
import { createTrajet } from '@/lib/trajets';
import { fetchMyVehicle } from '@/lib/vehicles';
import { useSessionDraft, clearSessionDraft } from '@/hooks/use-session-draft';
import { cn } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui/list-skeleton';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';
import { SettingsSection } from '@/components/parametres/settings-section';
import { SectionNav, scrollToElement, scrollToSection, type SectionNavItem } from '@/components/ui/section-nav';

type Step = 'ride-vehicle' | 'license-insurance';

const PUBLISH_SECTION_ID = 'create-publish';

/**
 * Every field on this form, in one persisted draft — see `useSessionDraft`.
 * Some of these (`departureCity`, `amenities`, …) were already controlled
 * React state; the rest (`departurePlace`, `date`, `seatsTotal`, …) used to
 * be plain uncontrolled inputs read via `FormData` on submit, which is fine
 * against accidental double-entry but has nothing to restore from once the
 * component unmounts — folding them into the same draft is what makes a
 * locale switch mid-form non-destructive for every field, not just some.
 */
interface RideDraft {
  step: Step;
  ridePayload: CreateTrajetRequest | null;
  amenities: TrajetAmenity[];
  paymentMethods: RidePaymentMethod[];
  hasIntermediateStop: boolean;
  comfort: 'standard' | 'confort' | 'premium';
  departureCity: string;
  arrivalCity: string;
  departureLat: number | null;
  departureLng: number | null;
  arrivalLat: number | null;
  arrivalLng: number | null;
  departurePlace: string;
  arrivalPlace: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  seatsTotal: string;
  pricePerSeat: string;
  baggageAllowance: string;
  description: string;
}

const EMPTY_RIDE_DRAFT: RideDraft = {
  step: 'ride-vehicle',
  ridePayload: null,
  amenities: [],
  paymentMethods: ['card', 'interac', 'cash'],
  hasIntermediateStop: false,
  comfort: 'standard',
  departureCity: '',
  arrivalCity: '',
  departureLat: null,
  departureLng: null,
  arrivalLat: null,
  arrivalLng: null,
  departurePlace: '',
  arrivalPlace: '',
  date: '',
  departureTime: '',
  arrivalTime: '',
  seatsTotal: '2',
  pricePerSeat: '',
  baggageAllowance: '',
  description: '',
};

const RIDE_DRAFT_KEY = 'trajet-create-draft';

const SCHEMA_FIELD_IDS: Record<string, string> = {
  departureCity: 'create-departure-city',
  departurePlace: 'create-departure-place',
  arrivalCity: 'create-arrival-city',
  arrivalPlace: 'create-arrival-place',
  departureAt: 'create-date',
  pricePerSeat: 'create-price',
  seatsTotal: 'create-seats',
};

function firstInvalidControl(form: HTMLFormElement) {
  return form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input:invalid, select:invalid, textarea:invalid',
  );
}

function isBlank(value: string) {
  return value.trim() === '';
}

/** First empty required field, in page order — used to scroll after Next. */
function missingRequiredFieldId(draft: RideDraft): string | null {
  if (isBlank(draft.departureCity)) return 'create-departure-city';
  if (isBlank(draft.departurePlace)) return 'create-departure-place';
  if (isBlank(draft.arrivalCity)) return 'create-arrival-city';
  if (isBlank(draft.arrivalPlace)) return 'create-arrival-place';
  if (isBlank(draft.date)) return 'create-date';
  if (isBlank(draft.departureTime)) return 'create-departure-time';
  if (isBlank(draft.seatsTotal)) return 'create-seats';
  if (isBlank(draft.pricePerSeat)) return 'create-price';
  return null;
}

/** Jump to the first invalid control and show the browser's "fill this field" bubble. */
function revealInvalid(control: HTMLElement) {
  const visualId = control.dataset.focusTarget;
  const visual = (visualId && document.getElementById(visualId)) || control;
  scrollToElement(visual, undefined, true);
  visual.focus({ preventScroll: true });
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement
  ) {
    control.reportValidity();
  }
}

/**
 * Publish-a-ride form, two pages: (1) ride details + vehicle description,
 * (2) licence verification + insurance declaration. Both pages stay mounted
 * (toggled with `hidden`, not conditional rendering) so each page's own
 * state survives the driver going back and forth — and every field on Page 1
 * is backed by `RideDraft` (`useSessionDraft`) so it also survives a locale
 * switch, which remounts this whole component (see that hook's doc comment).
 *
 * Page 1 is a single native `<form>` for the ride fields. After Next, empty
 * required fields show an inline “this field is required” message and the
 * page jumps to the first one. `VehicleForm` is its own `<form>`, hence a
 * sibling rather than nested — its submit stays independent; the outer
 * “Suivant” is linked to `ride-details-form` via `form=` rather than sitting
 * inside it, and it also requires the vehicle to already be saved before
 * advancing.
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

  const [draft, setDraft] = useSessionDraft<RideDraft>(RIDE_DRAFT_KEY, EMPTY_RIDE_DRAFT);
  const [error, setError] = useState('');
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const pendingScrollId = useRef<string | null>(null);

  function updateDraft(patch: Partial<RideDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function queueScroll(id: string) {
    pendingScrollId.current = id;
  }

  useLayoutEffect(() => {
    const id = pendingScrollId.current;
    if (!id) return;
    pendingScrollId.current = null;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => scrollToSection(id));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [draft.step]);

  // Shares the `['my-vehicle']` cache with `VehicleForm`/`PublishChecklistStep`
  // — read here only to gate Page 1's "Suivant" on a vehicle actually existing.
  const vehicleQuery = useQuery({ queryKey: ['my-vehicle'], queryFn: fetchMyVehicle });

  const mutation = useMutation({
    mutationFn: createTrajet,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['trajet'] });
      queryClient.invalidateQueries({ queryKey: ['trajets', created.id] });
      // The ride is published — nothing left to restore a draft for.
      clearSessionDraft(RIDE_DRAFT_KEY);
      toast(t('create.success'));
      router.push(`/trajet/${created.id}`);
    },
    onError: () => setError(t('create.failed')),
  });

  function togglePaymentMethod(method: RidePaymentMethod) {
    updateDraft({
      paymentMethods: draft.paymentMethods.includes(method)
        ? draft.paymentMethods.filter((entry) => entry !== method)
        : [...draft.paymentMethods, method],
    });
  }

  function toggleAmenity(amenity: TrajetAmenity) {
    updateDraft({
      amenities: draft.amenities.includes(amenity)
        ? draft.amenities.filter((entry) => entry !== amenity)
        : [...draft.amenities, amenity],
    });
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
    setShowFieldErrors(true);

    const missingId = missingRequiredFieldId(draft);
    if (missingId) {
      const el = document.getElementById(missingId);
      if (el) {
        scrollToElement(el, undefined, true);
        el.focus({ preventScroll: true });
      }
      return;
    }

    const form = event.currentTarget;
    const departureAt = combine(draft.date, draft.departureTime);
    // Optional: null when the driver leaves it blank, same as arrivalPlace.
    const arrivalAt = combine(draft.date, draft.arrivalTime);

    if (!departureAt) {
      setError(t('create.invalid'));
      const fallback = document.getElementById(draft.date ? 'create-departure-time' : 'create-date');
      if (fallback) revealInvalid(fallback);
      return;
    }

    // An arrival earlier than the departure means the ride lands the next day.
    if (arrivalAt && arrivalAt < departureAt) arrivalAt.setDate(arrivalAt.getDate() + 1);

    const parsed = CreateTrajetRequestSchema.safeParse({
      departureCity: draft.departureCity.trim(),
      departurePlace: draft.departurePlace,
      departureLat: draft.departureLat,
      departureLng: draft.departureLng,
      arrivalCity: draft.arrivalCity.trim(),
      arrivalPlace: draft.arrivalPlace,
      arrivalLat: draft.arrivalLat,
      arrivalLng: draft.arrivalLng,
      departureAt: departureAt.toISOString(),
      arrivalAt: arrivalAt ? arrivalAt.toISOString() : null,
      pricePerSeat: Number(draft.pricePerSeat),
      seatsTotal: Number(draft.seatsTotal),
      amenities: draft.amenities,
      paymentMethods: draft.paymentMethods,
      hasIntermediateStop: draft.hasIntermediateStop,
      description: draft.description,
      comfort: draft.comfort,
      baggageAllowance: draft.baggageAllowance,
    });

    if (!parsed.success) {
      setError(t('create.invalid'));
      const key = parsed.error.issues[0]?.path[0];
      const fieldId = typeof key === 'string' ? SCHEMA_FIELD_IDS[key] : undefined;
      const fallback = (fieldId && document.getElementById(fieldId)) || firstInvalidControl(form);
      if (fallback) revealInvalid(fallback);
      return;
    }

    if (!vehicleQuery.data) {
      setError(t('create.step1.vehicleRequired'));
      scrollToSection('create-vehicle');
      return;
    }

    queueScroll(PUBLISH_SECTION_ID);
    updateDraft({ ridePayload: parsed.data, step: 'license-insurance' });
  }

  /**
   * Page 2's "Publier": fires once both checklist items are satisfied (see
   * `PublishChecklistStep`'s `onPublish`). Creates the ride regardless of the
   * driver's licence-verification status — that only ever gates the
   * "Vérifié"/"Non vérifié" badge, never trip creation.
   */
  function handlePublish() {
    if (!draft.ridePayload) {
      queueScroll('create-route');
      updateDraft({ step: 'ride-vehicle' });
      return;
    }
    setError('');
    mutation.mutate(draft.ridePayload);
  }

  const navItems: SectionNavItem[] = [
    { id: 'create-route', title: t('create.sections.route'), icon: MapPin },
    { id: 'create-when', title: t('create.sections.when'), icon: Clock },
    { id: 'create-fare', title: t('create.sections.fare'), icon: Wallet },
    { id: 'create-details', title: t('create.sections.details'), icon: Sparkles },
    { id: 'create-vehicle', title: t('create.sections.vehicle'), icon: Car },
  ];

  const onFirstStep = draft.step === 'ride-vehicle';
  const layoutClass = cn(
    'flex min-w-0 flex-col gap-6 overflow-x-clip',
    onFirstStep &&
      'lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-8 lg:overflow-visible',
  );

  if (isSessionPending) {
    return (
      <div className={layoutClass}>
        <PageHeader className="mb-0 lg:col-span-2" title={t('create.title')} subtitle={t('create.subtitle')} />
        <div className="grid gap-6 lg:col-start-2">
          <CardSkeleton rows={6} label={t('loading')} />
          <CardSkeleton rows={4} label={t('loading')} />
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className={layoutClass}>
        <PageHeader className="mb-0 lg:col-span-2" title={t('create.title')} subtitle={t('create.subtitle')} />
        <Card className="lg:col-start-2">
          <CardContent className="flex flex-col items-center gap-3 pt-0 text-center">
            <p className="text-sm text-muted-foreground">{t('authRequired')}</p>
            <Link href={signInHref('/trajet/nouveau')} className="text-sm font-semibold text-primary hover:underline">
              {t('authCta')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={layoutClass}>
      <PageHeader className="mb-0 lg:col-span-2" title={t('create.title')} subtitle={t('create.subtitle')} />
      {onFirstStep ? (
        <SectionNav
          items={navItems}
          label={t('create.navLabel')}
          className="lg:col-start-1 lg:row-start-2"
        />
      ) : null}

      <div className={cn('grid gap-10', onFirstStep && 'lg:col-start-2 lg:row-start-2')}>
        <div className={cn('grid gap-10', draft.step !== 'ride-vehicle' && 'hidden')}>
          <form id="ride-details-form" noValidate onSubmit={handleStep1Submit} className="grid gap-10">
            <SettingsSection id="create-route" title={t('create.sections.route')}>
              <Card className="overflow-visible">
                <CardContent className="grid gap-6 pt-0 lg:grid-cols-2 lg:items-start">
                  <Field label={t('create.departure')}>
                    <div className="flex flex-col gap-1.5">
                      <LocationPicker
                        id="create-departure-city"
                        name="departureCity"
                        value={{ city: draft.departureCity, lat: draft.departureLat, lng: draft.departureLng }}
                        onChange={(value: LocationValue) =>
                          updateDraft({ departureCity: value.city, departureLat: value.lat, departureLng: value.lng })
                        }
                        placeholder={t('filters.from')}
                        aria-label={t('filters.from')}
                        useMyLocationLabel={t('create.useMyLocation')}
                        locationErrorLabel={t('create.locationError')}
                        mapColor="blue"
                        required
                        invalid={showFieldErrors && isBlank(draft.departureCity)}
                      />
                      {showFieldErrors && isBlank(draft.departureCity) ? (
                        <FormAlert id="create-departure-city-error">{t('create.fieldRequired')}</FormAlert>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Input
                        id="create-departure-place"
                        name="departurePlace"
                        value={draft.departurePlace}
                        onChange={(event) => updateDraft({ departurePlace: event.target.value })}
                        placeholder={t('create.departurePlace')}
                        required
                        aria-invalid={showFieldErrors && isBlank(draft.departurePlace) ? true : undefined}
                        aria-describedby={
                          showFieldErrors && isBlank(draft.departurePlace)
                            ? 'create-departure-place-error'
                            : undefined
                        }
                        className={
                          showFieldErrors && isBlank(draft.departurePlace)
                            ? 'ring-destructive focus-visible:ring-destructive/30'
                            : undefined
                        }
                      />
                      {showFieldErrors && isBlank(draft.departurePlace) ? (
                        <FormAlert id="create-departure-place-error">{t('create.fieldRequired')}</FormAlert>
                      ) : null}
                    </div>
                  </Field>

                  <Field label={t('create.arrival')}>
                    <div className="flex flex-col gap-1.5">
                      <LocationPicker
                        id="create-arrival-city"
                        name="arrivalCity"
                        value={{ city: draft.arrivalCity, lat: draft.arrivalLat, lng: draft.arrivalLng }}
                        onChange={(value: LocationValue) =>
                          updateDraft({ arrivalCity: value.city, arrivalLat: value.lat, arrivalLng: value.lng })
                        }
                        placeholder={t('filters.to')}
                        aria-label={t('filters.to')}
                        useMyLocationLabel={t('create.useMyLocation')}
                        locationErrorLabel={t('create.locationError')}
                        mapColor="green"
                        required
                        invalid={showFieldErrors && isBlank(draft.arrivalCity)}
                      />
                      {showFieldErrors && isBlank(draft.arrivalCity) ? (
                        <FormAlert id="create-arrival-city-error">{t('create.fieldRequired')}</FormAlert>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Input
                        id="create-arrival-place"
                        name="arrivalPlace"
                        value={draft.arrivalPlace}
                        onChange={(event) => updateDraft({ arrivalPlace: event.target.value })}
                        placeholder={t('create.arrivalPlace')}
                        required
                        aria-invalid={showFieldErrors && isBlank(draft.arrivalPlace) ? true : undefined}
                        aria-describedby={
                          showFieldErrors && isBlank(draft.arrivalPlace) ? 'create-arrival-place-error' : undefined
                        }
                        className={
                          showFieldErrors && isBlank(draft.arrivalPlace)
                            ? 'ring-destructive focus-visible:ring-destructive/30'
                            : undefined
                        }
                      />
                      {showFieldErrors && isBlank(draft.arrivalPlace) ? (
                        <FormAlert id="create-arrival-place-error">{t('create.fieldRequired')}</FormAlert>
                      ) : null}
                    </div>
                  </Field>
                </CardContent>
              </Card>
            </SettingsSection>

            <SettingsSection id="create-when" title={t('create.sections.when')}>
              <Card className="overflow-visible">
                <CardContent className="grid gap-3 pt-0">
                  <LabelledField
                    label={t('filters.date')}
                    htmlFor="create-date"
                    error={showFieldErrors && isBlank(draft.date) ? t('create.fieldRequired') : undefined}
                  >
                    <DropdownDatePicker
                      id="create-date"
                      value={paramToDate(draft.date)}
                      onChange={(next) => updateDraft({ date: dateToParam(next) })}
                      placeholder={t('filters.date')}
                      aria-label={t('filters.date')}
                      required
                      invalid={showFieldErrors && isBlank(draft.date)}
                    />
                  </LabelledField>
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                    <LabelledField
                      label={t('create.departureTime')}
                      htmlFor="create-departure-time"
                      error={
                        showFieldErrors && isBlank(draft.departureTime) ? t('create.fieldRequired') : undefined
                      }
                    >
                      <DropdownTimePicker
                        id="create-departure-time"
                        value={parseTime(draft.departureTime)}
                        onChange={(next) => updateDraft({ departureTime: formatTime(next) })}
                        ariaLabel={t('create.departureTime')}
                        required
                        invalid={showFieldErrors && isBlank(draft.departureTime)}
                      />
                    </LabelledField>
                    <LabelledField label={t('create.arrivalTime')} htmlFor="create-arrival-time">
                      <DropdownTimePicker
                        id="create-arrival-time"
                        value={parseTime(draft.arrivalTime)}
                        onChange={(next) => updateDraft({ arrivalTime: formatTime(next) })}
                        ariaLabel={t('create.arrivalTime')}
                      />
                    </LabelledField>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('create.timesHint')}</p>
                </CardContent>
              </Card>
            </SettingsSection>

            <SettingsSection id="create-fare" title={t('create.sections.fare')}>
              <Card className="overflow-visible">
                <CardContent className="grid min-w-0 grid-cols-2 gap-3 pt-0">
                  <LabelledField
                    label={t('create.seatsTotal')}
                    htmlFor="create-seats"
                    error={showFieldErrors && isBlank(draft.seatsTotal) ? t('create.fieldRequired') : undefined}
                  >
                    <Input
                      type="number"
                      id="create-seats"
                      name="seatsTotal"
                      min={1}
                      max={8}
                      value={draft.seatsTotal}
                      onChange={(event) => updateDraft({ seatsTotal: event.target.value })}
                      required
                      aria-invalid={showFieldErrors && isBlank(draft.seatsTotal) ? true : undefined}
                      aria-describedby={
                        showFieldErrors && isBlank(draft.seatsTotal) ? 'create-seats-error' : undefined
                      }
                      className={
                        showFieldErrors && isBlank(draft.seatsTotal)
                          ? 'ring-destructive focus-visible:ring-destructive/30'
                          : undefined
                      }
                    />
                  </LabelledField>
                  <LabelledField
                    label={t('create.pricePerSeat')}
                    htmlFor="create-price"
                    error={showFieldErrors && isBlank(draft.pricePerSeat) ? t('create.fieldRequired') : undefined}
                  >
                    <Input
                      type="number"
                      id="create-price"
                      name="pricePerSeat"
                      min={0}
                      step="0.5"
                      value={draft.pricePerSeat}
                      onChange={(event) => updateDraft({ pricePerSeat: event.target.value })}
                      required
                      aria-invalid={showFieldErrors && isBlank(draft.pricePerSeat) ? true : undefined}
                      aria-describedby={
                        showFieldErrors && isBlank(draft.pricePerSeat) ? 'create-price-error' : undefined
                      }
                      className={
                        showFieldErrors && isBlank(draft.pricePerSeat)
                          ? 'ring-destructive focus-visible:ring-destructive/30'
                          : undefined
                      }
                    />
                  </LabelledField>
                </CardContent>
              </Card>
            </SettingsSection>

            <SettingsSection id="create-details" title={t('create.sections.details')}>
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('comfort.legend')}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <Select
                      value={draft.comfort}
                      onValueChange={(value) => updateDraft({ comfort: value as RideDraft['comfort'] })}
                    >
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
                        value={draft.baggageAllowance}
                        onChange={(event) => updateDraft({ baggageAllowance: event.target.value })}
                        maxLength={500}
                        placeholder={t('create.baggagePlaceholder')}
                      />
                    </LabelledField>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('create.paymentMethods')}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <p className="text-xs text-muted-foreground">{t('create.paymentMethodsHint')}</p>
                    <div className="grid gap-2">
                      {RIDE_PAYMENT_METHODS.map((method) => (
                        <Checkbox
                          key={method}
                          checked={draft.paymentMethods.includes(method)}
                          onChange={() => togglePaymentMethod(method)}
                          label={t(`paymentMethods.${method}`)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{t('create.options')}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <AmenityToggleGroup
                    selected={draft.amenities}
                    onToggle={toggleAmenity}
                    label={(amenity) => t(`amenities.${amenity}`)}
                    legend={t('filters.amenitiesLegend')}
                    amenities={GENERAL_AMENITIES}
                    className="justify-start"
                  />
                  <Checkbox
                    name="hasIntermediateStop"
                    checked={draft.hasIntermediateStop}
                    onChange={(event) => updateDraft({ hasIntermediateStop: event.target.checked })}
                    label={t('create.intermediateStop')}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('create.description')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    name="description"
                    value={draft.description}
                    onChange={(event) => updateDraft({ description: event.target.value })}
                    maxLength={500}
                    placeholder={t('create.descriptionPlaceholder')}
                  />
                </CardContent>
              </Card>
            </SettingsSection>
          </form>

          {/* Sibling, not nested — `VehicleForm` is its own `<form>`, and forms
              cannot nest. Its submit button stays independent; the outer
              "Suivant" below is linked to `ride-details-form` via `form=`
              rather than being inside it. */}
          <SettingsSection id="create-vehicle" title={t('create.sections.vehicle')}>
            <Card>
              <CardContent className="pt-0">
                <VehicleForm embedded />
              </CardContent>
            </Card>
            {!vehicleQuery.data ? (
              <p className="text-xs text-muted-foreground">{t('create.step3.saveHint')}</p>
            ) : null}
          </SettingsSection>

          {draft.step === 'ride-vehicle' && error ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex sm:justify-end">
            <Button type="submit" form="ride-details-form" variant="primary" size="lg" className="w-full px-10 sm:w-auto">
              {t('create.step1.next')}
              <ArrowRight className="size-5" strokeWidth={2.25} />
            </Button>
          </div>
        </div>

        <div className={cn('grid gap-10', draft.step !== 'license-insurance' && 'hidden')}>
          <SettingsSection id="create-publish" title={t('create.sections.publish')}>
            {draft.step === 'license-insurance' && error ? (
              <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <PublishChecklistStep
              onPublish={handlePublish}
              onBack={() => {
                queueScroll('create-route');
                updateDraft({ step: 'ride-vehicle' });
              }}
              publishing={mutation.isPending}
            />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

/** A labelled group of related inputs. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold text-foreground">{label}</legend>
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
