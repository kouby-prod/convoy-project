import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { TrajetListing, TrajetAmenity } from '@carpool/schemas';
import { formatCad, koubyFeeCents } from '@/lib/booking-money';
import { RatingStars } from '@/components/trajet/rating-stars';
import { TrajetAmenities } from '@/components/trajet/trajet-amenities';
import { ItineraryRow } from '@/components/trajet/itinerary-row';
import { Badge } from '@/components/ui/badge';

interface TrajetRowProps {
  trajet: TrajetListing;
}

/* One search result: time · route · occupancy · price, with driver + amenities. */
export function TrajetRow({ trajet }: TrajetRowProps) {
  const t = useTranslations('Trajet');
  const format = useFormatter();
  const locale = useLocale();
  const taken = Math.max(0, trajet.seatsTotal - trajet.seatsAvailable);
  const driverName = trajet.driver.firstName
    ? `${trajet.driver.firstName}${trajet.driver.lastName ? ` ${trajet.driver.lastName.charAt(0)}.` : ''}`
    : '';
  const place = [trajet.departurePlace, trajet.arrivalPlace].filter(Boolean).join(' → ') || null;

  return (
    <ItineraryRow
      href={`/trajet/${trajet.id}`}
      departureIso={trajet.departureAt}
      arrivalIso={trajet.arrivalAt}
      from={trajet.departureCity}
      to={trajet.arrivalCity}
      place={place}
      priceLabel={format.number(trajet.pricePerSeat, { style: 'currency', currency: 'CAD' })}
      priceHint={t('plusKoubyFee', { amount: formatCad(koubyFeeCents(), locale) })}
      occupancy={{
        taken,
        total: trajet.seatsTotal,
        label: t('occupancy', { taken, total: trajet.seatsTotal }),
      }}
      trailing={
        trajet.seatsAvailable === 0 ? (
          <Badge variant="destructive" className="font-medium">
            {t('seatsAvailable', { count: 0 })}
          </Badge>
        ) : null
      }
      footer={
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {driverName ? (
            <span className="text-xs text-muted-foreground">{t('driverBy', { name: driverName })}</span>
          ) : null}
          {trajet.driver.rating !== null ? (
            <RatingStars
              rating={trajet.driver.rating}
              label={t('ratingLabel', {
                rating: trajet.driver.rating,
                count: trajet.driver.reviewCount ?? 0,
              })}
            />
          ) : null}
          <Badge variant={trajet.driver.verified ? 'success' : 'neutral'}>
            {t(trajet.driver.verified ? 'driverVerified.verified' : 'driverVerified.unverified')}
          </Badge>
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
      }
    />
  );
}
