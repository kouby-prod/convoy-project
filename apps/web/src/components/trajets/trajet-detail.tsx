'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Briefcase, Car, Sparkles, Users } from 'lucide-react';
import { createApiClient } from '@carpool/api-client';
import type { TrajetAmenity } from '@carpool/schemas';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { RatingStars } from '@/components/trajet/rating-stars';
import { AmenityIcon, isAmenity } from '@/components/trajet/trajet-amenities';
import {
  formatTripDuration,
  ItineraryTimeline,
} from '@/components/trajet/itinerary-timeline';
import { TrajetBookings } from '@/components/trajets/trajet-bookings';
import { TrajetBookingForm } from '@/components/trajets/trajet-booking-form';
import { TrajetOwnerActions } from '@/components/trajets/trajet-owner-actions';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/**
 * Ride detail — BlaBlaCar-inspired: itinerary timeline first, trust (driver),
 * then options. Booking stays a quiet side panel, not the visual hero.
 */
export function TrajetDetail({ id }: { id: string }) {
  const t = useTranslations('Trajets');
  const tRide = useTranslations('Trajet');
  const format = useFormatter();
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
    return <p className="py-10 text-center text-sm text-muted-foreground">{t('loading')}</p>;
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink label={t('backToList')} />
        <p className="text-sm text-destructive">{t('error')}</p>
      </div>
    );
  }

  const departure = new Date(data.departureDateTime);
  const arrival = data.arrivalDateTime ? new Date(data.arrivalDateTime) : null;
  const clock = { hour: '2-digit', minute: '2-digit' } as const;
  const isOwner = session?.user?.id === data.driverId;
  const amenities = (data.amenities ?? []).filter(isAmenity);
  const driverName = [data.driver.firstName, data.driver.lastName].filter(Boolean).join(' ');
  const initials = [data.driver.firstName?.[0], data.driver.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <BackLink label={t('backToList')} />

      {data.cancelledAt ? (
        <p
          role="status"
          className="rounded-md bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive ring-1 ring-destructive/20"
        >
          {t('cancelledBanner')}
        </p>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start lg:gap-12">
        {/* ── Main column: itinerary → driver → options ─────────── */}
        <div className="flex flex-col gap-10">
          <h1 className="sr-only">
            {data.departureCity} → {data.destinationCity}
          </h1>

          <ItineraryTimeline
            dateLabel={format.dateTime(departure, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            departure={{
              timeLabel: format.dateTime(departure, clock),
              city: data.departureCity,
              place: data.departurePlace,
            }}
            arrival={{
              timeLabel: arrival
                ? format.dateTime(arrival, clock)
                : t('itinerary.arrivalApprox'),
              city: data.destinationCity,
              place: data.arrivalPlace,
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

          {/* Driver — trust strip */}
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
                <p className="font-semibold text-foreground">{driverName || '—'}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {data.driver.rating !== null && (data.driver.reviewCount ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <RatingStars
                        rating={data.driver.rating}
                        label={t('driverRating.summary', {
                          rating: data.driver.rating.toFixed(1),
                          count: data.driver.reviewCount ?? 0,
                        })}
                      />
                      <span>
                        {t('driverRating.summary', {
                          rating: data.driver.rating.toFixed(1),
                          count: data.driver.reviewCount ?? 0,
                        })}
                      </span>
                    </span>
                  ) : (
                    <span>{t('driverRating.none')}</span>
                  )}
                  {data.driver.licenceYears !== null ? (
                    <span className="inline-flex items-center gap-1">
                      <BadgeCheck className="size-3.5 text-success" strokeWidth={2} aria-hidden />
                      {t('licenceYears', { count: data.driver.licenceYears })}
                    </span>
                  ) : null}
                </div>

                {(data.driver.carMake || data.driver.carModel || data.driver.carSeats !== null) && (
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    {data.driver.carMake || data.driver.carModel ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Car className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="text-foreground">
                          {[data.driver.carMake, data.driver.carModel].filter(Boolean).join(' ')}
                        </span>
                      </div>
                    ) : null}
                    {data.driver.carSeats !== null ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="text-foreground">
                          {t('carSeatsValue', { count: data.driver.carSeats })}
                        </span>
                      </div>
                    ) : null}
                  </dl>
                )}
              </div>
            </div>
          </section>

          {/* Ride options — secondary */}
          {(amenities.length > 0 || data.comfort || data.baggageAllowance) && (
            <section aria-labelledby="options-heading" className="border-t border-border pt-8">
              <h2 id="options-heading" className="text-sm font-semibold text-foreground">
                {t('rideOptions')}
              </h2>
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {data.comfort ? (
                  <li className="flex items-center gap-2.5 text-sm text-foreground">
                    <Sparkles className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                    {t('comfort')}: {tRide(`comfort.${data.comfort}`)}
                  </li>
                ) : null}
                {data.baggageAllowance ? (
                  <li className="flex items-center gap-2.5 text-sm text-foreground">
                    <Briefcase className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                    {data.baggageAllowance}
                  </li>
                ) : null}
                {amenities.map((amenity) => (
                  <li key={amenity} className="flex items-center gap-2.5 text-sm text-foreground">
                    <AmenityIcon amenity={amenity as TrajetAmenity} className="size-4 shrink-0 text-muted-foreground" />
                    {tRide(`amenities.${amenity}`)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.description ? (
            <section aria-labelledby="desc-heading" className="border-t border-border pt-8">
              <h2 id="desc-heading" className="text-sm font-semibold text-foreground">
                {t('description')}
              </h2>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {data.description}
              </p>
            </section>
          ) : null}

          {isOwner ? (
            <div className="flex flex-col gap-6 border-t border-border pt-8">
              <TrajetOwnerActions trajet={data} />
              <TrajetBookings trajetId={id} departureDateTime={data.departureDateTime} />
            </div>
          ) : null}
        </div>

        {/* ── Quiet booking panel ──────────────────────────────── */}
        <aside className="lg:sticky lg:top-20">
          {isOwner ? (
            <div className="rounded-md border border-border bg-card px-4 py-4 text-sm">
              <p className="font-medium text-foreground">{t('ownerAside.title')}</p>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">{t('ownerAside.body')}</p>
            </div>
          ) : (
            <TrajetBookingForm
              trajetId={id}
              seatsAvailable={data.seatsAvailable}
              cancelled={!!data.cancelledAt}
              pricePerSeat={data.pricePerSeat}
              seatsTotal={data.seatsTotal}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/trajet"
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
