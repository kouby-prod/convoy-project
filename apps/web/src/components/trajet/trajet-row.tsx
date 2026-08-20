import { useFormatter, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import type { TrajetListing, TrajetAmenity } from '@carpool/schemas';
import { COMMISSION_AMOUNT_CENTS } from '@carpool/schemas';
import { Link } from '@/i18n/navigation';
import { RatingStars } from '@/components/trajet/rating-stars';
import { TrajetAmenities } from '@/components/trajet/trajet-amenities';
import { Badge } from '@/components/ui/badge';

interface TrajetRowProps {
  trajet: TrajetListing;
}

/* One search result: time · route · price · seats, with amenities underneath.
   The whole row links to the ride detail page. */
export function TrajetRow({ trajet }: TrajetRowProps) {
  const t = useTranslations('Trajet');
  const format = useFormatter();

  const departure = new Date(trajet.departureAt);
  const arrival = trajet.arrivalAt ? new Date(trajet.arrivalAt) : null;
  const time = { hour: '2-digit', minute: '2-digit' } as const;
  const driverName = trajet.driver.firstName
    ? `${trajet.driver.firstName}${trajet.driver.lastName ? ` ${trajet.driver.lastName.charAt(0)}.` : ''}`
    : '';

  return (
    <Link
      href={`/trajet/${trajet.id}`}
      className="block rounded-md px-4 py-4 outline-none transition-all duration-200 ease-smooth hover:bg-muted/80 focus-visible:ring-3 focus-visible:ring-ring/30 sm:px-5 sm:py-5"
    >
      <div className="grid gap-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
        {/* Departure / arrival times */}
        <div className="flex items-baseline gap-2 text-sm sm:flex-col sm:items-start sm:gap-0.5">
          <p className="font-semibold tabular-nums text-foreground">
            {format.dateTime(departure, time)}
          </p>
          {arrival ? (
            <p className="tabular-nums text-muted-foreground">{format.dateTime(arrival, time)}</p>
          ) : null}
        </div>

        {/* Route */}
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-semibold text-foreground">{trajet.departureCity}</p>
            <ArrowRight className="size-3.5 shrink-0 text-brand-blue" strokeWidth={2.25} aria-hidden />
            <p className="truncate font-semibold text-foreground">{trajet.arrivalCity}</p>
          </div>
          {(trajet.departurePlace || trajet.arrivalPlace) && (
            <p className="truncate text-xs text-muted-foreground">
              {[trajet.departurePlace, trajet.arrivalPlace].filter(Boolean).join(' → ')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {driverName ? <span>{t('driverBy', { name: driverName })}</span> : null}
            {trajet.driver.rating !== null ? (
              <RatingStars
                rating={trajet.driver.rating}
                label={t('ratingLabel', {
                  rating: trajet.driver.rating,
                  count: trajet.driver.reviewCount ?? 0,
                })}
              />
            ) : null}
          </div>
        </div>

        {/* Price + seats */}
        <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-2">
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {format.number(trajet.pricePerSeat, { style: 'currency', currency: 'CAD' })}
            </p>
            <p className="text-[11px] text-muted-foreground">{t('perSeat')}</p>
            <p className="text-[11px] text-muted-foreground">
              {t('plusKoubyFee', {
                amount: format.number(COMMISSION_AMOUNT_CENTS / 100, { style: 'currency', currency: 'CAD' }),
              })}
            </p>
          </div>
          <Badge
            variant={trajet.seatsAvailable === 0 ? 'destructive' : 'secondary'}
            className="font-medium"
          >
            {t('seatsAvailable', { count: trajet.seatsAvailable })}
          </Badge>
        </div>
      </div>

      {trajet.amenities.length > 0 || trajet.paymentMethods.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {trajet.amenities.length > 0 ? (
            <TrajetAmenities
              amenities={trajet.amenities}
              label={(amenity: TrajetAmenity) => t(`amenities.${amenity}`)}
              className="justify-start"
            />
          ) : null}
          {trajet.paymentMethods.map((method) => (
            <Badge key={method} variant="secondary" className="font-medium">
              {t(`paymentMethods.${method}`)}
            </Badge>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
