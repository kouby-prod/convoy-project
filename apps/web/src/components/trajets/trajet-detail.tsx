'use client';

import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Briefcase, Car, CreditCard, Banknote, Sparkles, Users } from 'lucide-react';
import { createApiClient } from '@carpool/api-client';
import { PAYMENT_AMENITIES, type RidePaymentMethod, type Trajet, type TrajetAmenity } from '@carpool/schemas';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SegmentedTabs, TabPanel } from '@/components/ui/segmented-tabs';
import { RatingStars } from '@/components/trajet/rating-stars';
import { AmenityIcon, isAmenity } from '@/components/trajet/trajet-amenities';
import {
  formatTripDuration,
  ItineraryTimeline,
} from '@/components/trajet/itinerary-timeline';
import { TrajetBookings } from '@/components/trajets/trajet-bookings';
import { TrajetBookingForm } from '@/components/trajets/trajet-booking-form';
import { TrajetOwnerActions } from '@/components/trajets/trajet-owner-actions';
import { LiveLocationShare } from '@/components/trajets/live-location-share';
import { TripMap, type TripMapPin } from '@/components/ui/trip-map';
import { DetailSkeleton } from '@/components/ui/list-skeleton';
import { useTrajetLiveLocation } from '@/hooks/use-trajet-live-location';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const clock = { hour: '2-digit', minute: '2-digit' } as const;

/**
 * Ride detail — two jobs, two layouts.
 *
 * Passengers keep a BlaBlaCar listing (itinerary + quiet book panel).
 * Drivers get an operational console: compact chrome, Bookings vs Ride tabs,
 * and a master-detail inbox (Material list-detail / Airbnb host).
 */
export function TrajetDetail({ id }: { id: string }) {
  const t = useTranslations('Trajets');
  const { data: session } = authClient.useSession();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trajets', id],
    queryFn: async () => {
      const res = await api.trajets[':id'].$get({ param: { id } });
      if (!res.ok) throw new Error('Failed to load trajet');
      return res.json();
    },
  });

  if (isLoading) {
    return <DetailSkeleton label={t('loading')} />;
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink label={t('backToList')} />
        <p role="alert" className="text-sm text-destructive">{t('error')}</p>
      </div>
    );
  }

  const isOwner = session?.user?.id === data.driverId;

  if (isOwner) {
    return <DriverRideWorkspace id={id} trajet={data} />;
  }

  return <PassengerRideView id={id} trajet={data} />;
}

function DriverRideWorkspace({ id, trajet }: { id: string; trajet: Trajet }) {
  const t = useTranslations('Trajets');
  const format = useFormatter();
  const [tab, setTab] = useState<'requests' | 'trip'>('requests');
  const departure = new Date(trajet.departureDateTime);
  const arrival = trajet.arrivalDateTime ? new Date(trajet.arrivalDateTime) : null;

  return (
    <div className="flex w-full flex-col gap-4">
      <BackLink href="/mes-trajets" label={t('ownerWorkspace.backToRides')} />

      {trajet.cancelledAt ? (
        <p
          role="status"
          className="rounded-md bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive ring-1 ring-destructive/20"
        >
          {t('cancelledBanner')}
        </p>
      ) : null}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {trajet.departureCity} → {trajet.destinationCity}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format.dateTime(departure, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
            {' · '}
            {format.dateTime(departure, clock)}
            {' · '}
            {t('seatsAvailable', { available: trajet.seatsAvailable, total: trajet.seatsTotal })}
          </p>
        </div>
        <SegmentedTabs
          id="owner-workspace"
          size="compact"
          label={t('ownerWorkspace.tabsLabel')}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'requests', label: t('ownerWorkspace.tabRequests') },
            { id: 'trip', label: t('ownerWorkspace.tabTrip') },
          ]}
        />
      </header>

      <TabPanel tabsId="owner-workspace" tab={tab}>
      {tab === 'requests' ? (
        <TrajetBookings trajetId={id} departureDateTime={trajet.departureDateTime} />
      ) : (
        <div className="flex flex-col gap-6">
          <TrajetOwnerActions trajet={trajet} />
          <LiveLocationShare trajetId={id} cancelled={!!trajet.cancelledAt} />
          <ItineraryTimeline
            dateLabel={format.dateTime(departure, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            departure={{
              timeLabel: format.dateTime(departure, clock),
              city: trajet.departureCity,
              place: trajet.departurePlace,
            }}
            arrival={{
              timeLabel: arrival
                ? format.dateTime(arrival, clock)
                : t('itinerary.arrivalApprox'),
              city: trajet.destinationCity,
              place: trajet.arrivalPlace,
              timeMuted: !arrival,
            }}
            durationLabel={
              arrival
                ? formatTripDuration(departure, arrival, {
                    minutes: (n) => t('itinerary.durationMinutes', { count: n }),
                    hours: (n) => t('itinerary.durationHours', { count: n }),
                    full: (h, m) => t('itinerary.durationFull', { hours: h, minutes: m }),
                  })
                : null
            }
          />
          <RideOptions trajet={trajet} />
          <RideDescription description={trajet.description ?? null} />
        </div>
      )}
      </TabPanel>
    </div>
  );
}

function PassengerRideView({ id, trajet }: { id: string; trajet: Trajet }) {
  const t = useTranslations('Trajets');
  const tRide = useTranslations('Trajet');
  const format = useFormatter();
  const departure = new Date(trajet.departureDateTime);
  const arrival = trajet.arrivalDateTime ? new Date(trajet.arrivalDateTime) : null;
  const driverName = [trajet.driver.firstName, trajet.driver.lastName].filter(Boolean).join(' ');
  const initials = [trajet.driver.firstName?.[0], trajet.driver.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase();
  const { location: liveLocation } = useTrajetLiveLocation(id, { enabled: !trajet.cancelledAt });
  const pins: (TripMapPin | null)[] = [
    trajet.departureLat !== null && trajet.departureLng !== null
      ? { id: 'departure', lat: trajet.departureLat, lng: trajet.departureLng, color: 'blue' }
      : null,
    trajet.arrivalLat !== null && trajet.arrivalLng !== null
      ? { id: 'arrival', lat: trajet.arrivalLat, lng: trajet.arrivalLng, color: 'green' }
      : null,
    liveLocation
      ? { id: 'live', lat: liveLocation.lat, lng: liveLocation.lng, color: 'yellow', kind: 'live' }
      : null,
  ];
  const visiblePins = pins.filter((pin): pin is TripMapPin => pin !== null);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <BackLink label={t('backToList')} />

      {trajet.cancelledAt ? (
        <p
          role="status"
          className="rounded-md bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive ring-1 ring-destructive/20"
        >
          {t('cancelledBanner')}
        </p>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-12">
        <div className="flex flex-col gap-10">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {trajet.departureCity} → {trajet.destinationCity}
            </h1>
            <p className="text-sm text-muted-foreground">
              {format.dateTime(departure, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </header>

          <div className="flex flex-col gap-4">
          <ItineraryTimeline
            dateLabel={format.dateTime(departure, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            departure={{
              timeLabel: format.dateTime(departure, clock),
              city: trajet.departureCity,
              place: trajet.departurePlace,
            }}
            arrival={{
              timeLabel: arrival
                ? format.dateTime(arrival, clock)
                : t('itinerary.arrivalApprox'),
              city: trajet.destinationCity,
              place: trajet.arrivalPlace,
              timeMuted: !arrival,
            }}
            durationLabel={
              arrival
                ? formatTripDuration(departure, arrival, {
                    minutes: (n) => t('itinerary.durationMinutes', { count: n }),
                    hours: (n) => t('itinerary.durationHours', { count: n }),
                    full: (h, m) => t('itinerary.durationFull', { hours: h, minutes: m }),
                  })
                : null
            }
          />
          </div>

          {visiblePins.length > 0 ? (
            <div className="flex flex-col gap-2">
              {liveLocation ? (
                <span className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand-green">
                  <span className="size-2 animate-pulse rounded-full bg-brand-green" aria-hidden />
                  {t('liveLocation.sharing')}
                </span>
              ) : null}
              <TripMap pins={visiblePins} className="h-52" preserveViewOnUpdate />
            </div>
          ) : null}

          <section aria-labelledby="driver-heading" className="border-t border-border pt-8">
            <h2 id="driver-heading" className="text-sm font-semibold text-foreground">
              {t('driverTitle')}
            </h2>

            <div className="mt-4 flex items-start gap-4">
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-green/15 font-semibold text-brand-green ring-1 ring-brand-green/25"
                aria-hidden
              >
                {initials || '?'}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="flex items-center gap-2 font-semibold text-foreground">
                  {driverName || '—'}
                  <Badge variant={trajet.driver.verified ? 'success' : 'neutral'}>
                    {tRide(trajet.driver.verified ? 'driverVerified.verified' : 'driverVerified.unverified')}
                  </Badge>
                </p>
                <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {trajet.driver.rating !== null && (trajet.driver.reviewCount ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-2">
                      <RatingStars
                        rating={trajet.driver.rating}
                        label={t('driverRating.summary', {
                          rating: trajet.driver.rating.toFixed(1),
                          count: trajet.driver.reviewCount ?? 0,
                        })}
                      />
                      <span>
                        {t('driverRating.value', {
                          rating: trajet.driver.rating.toFixed(1),
                          count: trajet.driver.reviewCount ?? 0,
                        })}
                      </span>
                    </span>
                  ) : (
                    <span>{t('driverRating.none')}</span>
                  )}
                  {trajet.driver.licenceYears !== null ? (
                    <span className="inline-flex items-center gap-1">
                      <BadgeCheck className="size-3.5 text-success" strokeWidth={2} aria-hidden />
                      {t('licenceYears', { count: trajet.driver.licenceYears })}
                    </span>
                  ) : null}
                </div>

                {(trajet.driver.carMake || trajet.driver.carModel || trajet.driver.carSeats !== null) && (
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    {trajet.driver.carMake || trajet.driver.carModel ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Car className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="text-foreground">
                          {[trajet.driver.carMake, trajet.driver.carModel].filter(Boolean).join(' ')}
                        </span>
                      </div>
                    ) : null}
                    {trajet.driver.carSeats !== null ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="text-foreground">
                          {t('carSeatsValue', { count: trajet.driver.carSeats })}
                        </span>
                      </div>
                    ) : null}
                  </dl>
                )}
              </div>
            </div>
          </section>

          <RideOptions trajet={trajet} />
          <RideDescription description={trajet.description ?? null} />
        </div>

        <aside className="lg:sticky lg:top-20">
          <TrajetBookingForm
            trajetId={id}
            seatsAvailable={trajet.seatsAvailable}
            cancelled={!!trajet.cancelledAt}
            pricePerSeat={trajet.pricePerSeat}
            seatsTotal={trajet.seatsTotal}
            paymentMethods={(trajet.paymentMethods ?? []) as RidePaymentMethod[]}
          />
        </aside>
      </div>
    </div>
  );
}

function RideOptions({ trajet }: { trajet: Trajet }) {
  const t = useTranslations('Trajets');
  const tRide = useTranslations('Trajet');
  const amenities = (trajet.amenities ?? [])
    .filter(isAmenity)
    .filter((amenity) => !(PAYMENT_AMENITIES as readonly TrajetAmenity[]).includes(amenity));
  const methods = trajet.paymentMethods ?? [];

  if (
    amenities.length === 0 &&
    !trajet.comfort &&
    !trajet.baggageAllowance &&
    methods.length === 0
  ) {
    return null;
  }

  return (
    <section aria-labelledby="options-heading" className="border-t border-border pt-8">
      <h2 id="options-heading" className="text-sm font-semibold text-foreground">
        {t('rideOptions')}
      </h2>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {trajet.comfort ? (
          <li className="flex items-center gap-2.5 text-sm text-foreground">
            <Sparkles className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            {t('comfort')}: {tRide(`comfort.${trajet.comfort}`)}
          </li>
        ) : null}
        {trajet.baggageAllowance ? (
          <li className="flex items-center gap-2.5 text-sm text-foreground">
            <Briefcase className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            {trajet.baggageAllowance}
          </li>
        ) : null}
        {amenities.map((amenity) => (
          <li key={amenity} className="flex items-center gap-2.5 text-sm text-foreground">
            <AmenityIcon amenity={amenity as TrajetAmenity} className="size-4 shrink-0 text-muted-foreground" />
            {tRide(`amenities.${amenity}`)}
          </li>
        ))}
      </ul>
      {methods.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {tRide('create.paymentMethods')}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {methods.map((method) => (
              <li
                key={method}
                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {method === 'card' ? (
                  <CreditCard className="size-3.5 text-muted-foreground" strokeWidth={2} aria-hidden />
                ) : (
                  <Banknote className="size-3.5 text-muted-foreground" strokeWidth={2} aria-hidden />
                )}
                {tRide(`paymentMethodsShort.${method}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function RideDescription({ description }: { description: string | null }) {
  const t = useTranslations('Trajets');
  if (!description) return null;

  return (
    <section aria-labelledby="desc-heading" className="border-t border-border pt-8">
      <h2 id="desc-heading" className="text-sm font-semibold text-foreground">
        {t('description')}
      </h2>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">{description}</p>
    </section>
  );
}

function BackLink({ href = '/trajet', label }: { href?: '/trajet' | '/mes-trajets'; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        '-ml-2 w-fit gap-1.5 text-muted-foreground hover:text-foreground',
      )}
    >
      <ArrowLeft className="size-4" strokeWidth={2.25} />
      {label}
    </Link>
  );
}
