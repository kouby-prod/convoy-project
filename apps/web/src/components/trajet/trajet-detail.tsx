import { useFormatter, useTranslations } from 'next-intl';
import { ArrowRight, BadgeCheck, Car, Image as ImageIcon, Users } from 'lucide-react';
import type { TrajetListing, TrajetAmenity } from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
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

  const time = { hour: '2-digit', minute: '2-digit' } as const;
  const departure = new Date(trajet.departureAt);
  const arrival = new Date(trajet.arrivalAt);

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
              <p className="text-muted-foreground">
                {t('detail.arrivalAt', { time: format.dateTime(arrival, time) })}
              </p>
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
              <p className="text-lg font-semibold text-foreground">
                {format.number(trajet.pricePerSeat, { style: 'currency', currency: 'EUR' })}
              </p>
              <RatingStars
                rating={trajet.driver.rating}
                label={t('ratingLabel', {
                  rating: trajet.driver.rating,
                  count: trajet.driver.reviewCount,
                })}
              />
              <p className="text-xs text-muted-foreground">
                {t('seatsAvailable', { count: trajet.seatsAvailable })}
              </p>
            </div>
          </div>

          <TrajetAmenities
            amenities={trajet.amenities}
            label={(amenity: TrajetAmenity) => t(`amenities.${amenity}`)}
            className="mt-5 justify-center"
          />
        </CardContent>
      </Card>

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
                <dd className="font-medium text-foreground">
                  {trajet.driver.firstName} {trajet.driver.lastName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('detail.licenceYears')}</dt>
                <dd className="flex items-center gap-1.5 font-medium text-foreground">
                  <BadgeCheck className="size-4 text-secondary" strokeWidth={2} aria-hidden />
                  {t('detail.licenceYearsValue', { count: trajet.driver.licenceYears })}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('detail.vehicle')}</dt>
                <dd className="flex items-center gap-1.5 font-medium text-foreground">
                  <Car className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden />
                  {trajet.driver.carMake} {trajet.driver.carModel}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('detail.carSeats')}</dt>
                <dd className="flex items-center gap-1.5 font-medium text-foreground">
                  <Users className="size-4 text-muted-foreground" strokeWidth={2} aria-hidden />
                  {t('detail.carSeatsValue', { count: trajet.driver.carSeats })}
                </dd>
              </div>
            </dl>

            {/* Vehicle photos — labelled placeholders until drivers can upload. */}
            <ul className="flex gap-3">
              {[0, 1].map((index) => (
                <li
                  key={index}
                  className="flex size-24 flex-col items-center justify-center gap-1 rounded-3xl bg-muted text-muted-foreground ring-1 ring-foreground/5"
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
