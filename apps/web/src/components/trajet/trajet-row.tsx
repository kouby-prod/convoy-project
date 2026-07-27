import { useFormatter, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import type { Trajet, TrajetAmenity } from '@carpool/schemas';
import { Link } from '@/i18n/navigation';
import { RatingStars } from '@/components/trajet/rating-stars';
import { TrajetAmenities } from '@/components/trajet/trajet-amenities';

interface TrajetRowProps {
  trajet: Trajet;
}

/* One search result: time · departure · arrival · price · reviews, with the
   amenity strip underneath. The whole row links to the ride detail page. */
export function TrajetRow({ trajet }: TrajetRowProps) {
  const t = useTranslations('Trajet');
  const format = useFormatter();

  const departure = new Date(trajet.departureAt);
  const arrival = new Date(trajet.arrivalAt);
  const time = { hour: '2-digit', minute: '2-digit' } as const;

  return (
    <Link
      href={`/trajet/${trajet.id}`}
      className="block rounded-3xl px-4 py-5 outline-none transition-all duration-200 ease-smooth hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <div className="grid gap-3 sm:grid-cols-[5.5rem_1fr_1fr_auto] sm:items-start sm:gap-6">
        {/* Hours */}
        <div className="text-sm">
          <p className="font-semibold text-foreground">{format.dateTime(departure, time)}</p>
          <p className="text-muted-foreground">{format.dateTime(arrival, time)}</p>
        </div>

        {/* Departure */}
        <div className="min-w-0">
          <p className="truncate font-semibold text-primary">{trajet.departureCity}</p>
          <p className="truncate text-sm text-muted-foreground">{trajet.departurePlace}</p>
        </div>

        {/* Arrival */}
        <div className="flex min-w-0 items-start gap-2">
          <ArrowRight
            className="mt-0.5 hidden size-4 shrink-0 text-muted-foreground sm:block"
            strokeWidth={2}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate font-semibold text-primary">{trajet.arrivalCity}</p>
            <p className="truncate text-sm text-muted-foreground">{trajet.arrivalPlace}</p>
          </div>
        </div>

        {/* Price + reviews */}
        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-1.5">
          <p className="font-semibold text-foreground">
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
        className="mt-4 justify-center"
      />
    </Link>
  );
}
