import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { ArrowRight, BadgeCheck, Briefcase, Car, Image as ImageIcon, Sparkles, Users } from 'lucide-react';
import type { TrajetListing, TrajetAmenity } from '@carpool/schemas';
import { formatCad, koubyFeeCents } from '@/lib/booking-money';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TripMap, type TripMapPin } from '@/components/ui/trip-map';
import { RatingStars } from '@/components/trajet/rating-stars';
import { TrajetAmenities } from '@/components/trajet/trajet-amenities';

interface TrajetDetailProps {
  trajet: TrajetListing;
}

/* Ride detail header: the same columns as a result row, but with the hours
   spelled out — followed by the driver/vehicle profile. */
export function TrajetDetail({ trajet }: TrajetDetailProps) {
  const t = useTranslations('Trajet');
  const format = useFormatter();
  const locale = useLocale();

  const time = { hour: '2-digit', minute: '2-digit' } as const;
  const departure = new Date(trajet.departureAt);
  // Null until the driver supplies an estimate — the arrival line is dropped
  // rather than shown as an invented time.
  const arrival = trajet.arrivalAt ? new Date(trajet.arrivalAt) : null;

  // Coordinates are null until the background/picker geocode resolves (see
  // apps/api/src/modules/trajet/geocoding.ts) — the map is dropped rather
  // than shown centered on nothing.
  const pins: TripMapPin[] = [
    trajet.departureLat !== null && trajet.departureLng !== null
      ? { id: 'departure', lat: trajet.departureLat, lng: trajet.departureLng, color: 'blue' as const }
      : null,
    trajet.arrivalLat !== null && trajet.arrivalLng !== null
      ? { id: 'arrival', lat: trajet.arrivalLat, lng: trajet.arrivalLng, color: 'green' as const }
      : null,
  ].filter((pin): pin is TripMapPin => pin !== null);

  return (
    <div className="flex flex-col gap-8">
      {/* Summary band */}
      <Card className="overflow-hidden">
        <CardContent className="bg-muted p-6 pt-6">
          <div className="grid gap-5 lg:grid-cols-[13rem_1fr_1fr_auto] lg:items-start lg:gap-8">
            <div className="text-sm">
              <p className="font-semibold text-foreground">
                {t('detail.departureAt', { time: format.dateTime(departure, time) })}
              </p>
              {arrival ? (
                <p className="text-muted-foreground">
                  {t('detail.arrivalAt', { time: format.dateTime(arrival, time) })}
                </p>
              ) : null}
              <p className="mt-1 text-muted-foreground">
                {format.dateTime(departure, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>

            <div className="min-w-0">
              <p className="font-semibold text-primary">{trajet.departureCity}</p>
              <p className="text-sm text-muted-foreground">{trajet.departurePlace}</p>
            </div>

            <div className="flex min-w-0 items-start gap-2">
              <ArrowRight
                className="mt-1 hidden size-4 shrink-0 text-muted-foreground lg:block"
                strokeWidth={2}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-semibold text-primary">{trajet.arrivalCity}</p>
                <p className="text-sm text-muted-foreground">{trajet.arrivalPlace}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end lg:gap-1.5">
              <div className="text-right">
                <p className="text-lg font-semibold text-foreground">
                  {format.number(trajet.pricePerSeat, { style: 'currency', currency: 'CAD' })}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('perSeat')}</p>
                <p className="mt-1 text-xs font-medium text-foreground">
                  {t('plusKoubyFee', { amount: formatCad(koubyFeeCents(), locale) })}
                </p>
              </div>
              {trajet.driver.rating !== null ? (
                <RatingStars
                  rating={trajet.driver.rating}
                  label={t('ratingLabel', {
                    rating: trajet.driver.rating,
                    count: trajet.driver.reviewCount ?? 0,
                  })}
                />
              ) : null}
              <p className="text-xs text-muted-foreground">
                {t('seatsAvailable', { count: trajet.seatsAvailable })}
              </p>
            </div>
          </div>

          {trajet.comfort || trajet.baggageAllowance ? (
            <dl className="mt-5 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
              {trajet.comfort ? (
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden />
                  <dt className="text-muted-foreground">{t('detail.comfort')}</dt>
                  <dd className="font-medium text-foreground">
                    {t(`comfort.${trajet.comfort}`)}
                  </dd>
                </div>
              ) : null}
              {trajet.baggageAllowance ? (
                <div className="flex items-center gap-1.5">
                  <Briefcase className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden />
                  <dt className="text-muted-foreground">{t('detail.baggage')}</dt>
                  <dd className="font-medium text-foreground">{trajet.baggageAllowance}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <TrajetAmenities
            amenities={trajet.amenities}
            label={(amenity: TrajetAmenity) => t(`amenities.${amenity}`)}
            className="mt-5 justify-center"
          />
          {trajet.paymentMethods.length > 0 ? (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {trajet.paymentMethods.map((method) => t(`paymentMethods.${method}`)).join(' · ')}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {pins.length > 0 ? <TripMap pins={pins} className="h-56" /> : null}

      {/* Driver + vehicle */}
      <Card>
        <CardContent className="p-6 pt-6">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t('detail.driverTitle')}
          </h2>

          <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('detail.driverName')}</dt>
                <dd className="flex items-center gap-2 font-medium text-foreground">
                  {trajet.driver.firstName} {trajet.driver.lastName}
                  <Badge variant={trajet.driver.verified ? 'success' : 'neutral'}>
                    {t(trajet.driver.verified ? 'driverVerified.verified' : 'driverVerified.unverified')}
                  </Badge>
                </dd>
              </div>
              {trajet.driver.licenceYears !== null ? (
                <div>
                  <dt className="text-muted-foreground">{t('detail.licenceYears')}</dt>
                  <dd className="flex items-center gap-1.5 font-medium text-foreground">
                    <BadgeCheck className="size-4 text-success" strokeWidth={2} aria-hidden />
                    {t('detail.licenceYearsValue', { count: trajet.driver.licenceYears })}
                  </dd>
                </div>
              ) : null}
              {trajet.driver.carMake || trajet.driver.carModel ? (
                <div>
                  <dt className="text-muted-foreground">{t('detail.vehicle')}</dt>
                  <dd className="flex items-center gap-1.5 font-medium text-foreground">
                    <Car className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden />
                    {trajet.driver.carMake} {trajet.driver.carModel}
                  </dd>
                </div>
              ) : null}
              {trajet.driver.carSeats !== null ? (
                <div>
                  <dt className="text-muted-foreground">{t('detail.carSeats')}</dt>
                  <dd className="flex items-center gap-1.5 font-medium text-foreground">
                    <Users className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden />
                    {t('detail.carSeatsValue', { count: trajet.driver.carSeats })}
                  </dd>
                </div>
              ) : null}
            </dl>

            {/* Vehicle photos — labelled placeholders until drivers can upload. */}
            <ul className="flex gap-3">
              {[0, 1].map((index) => (
                <li
                  key={index}
                  className="flex size-24 flex-col items-center justify-center gap-1 rounded-md bg-muted text-muted-foreground ring-1 ring-foreground/5"
                >
                  <ImageIcon className="size-6" strokeWidth={1.75} aria-hidden />
                  <span className="text-[11px] font-medium">{t('detail.carPhoto')}</span>
                </li>
              ))}
            </ul>
          </div>

          {trajet.description ? (
            <p className="mt-6 text-sm text-muted-foreground">{trajet.description}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
