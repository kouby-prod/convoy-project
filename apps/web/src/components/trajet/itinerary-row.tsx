import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { OccupancyMeter } from '@/components/ui/occupancy-meter';
import { TripRoute } from '@/components/trajet/trip-route';
import { TripWhen } from '@/components/trajet/trip-when';
import { cn } from '@/lib/utils';

/**
 * Shared itinerary row for My rides, My bookings, and search. Time · route ·
 * occupancy · price stay one layout so the list cannot drift back into a CRUD dump.
 */
export function ItineraryRow({
  href,
  departureIso,
  arrivalIso,
  from,
  to,
  place,
  priceLabel,
  priceHint,
  occupancy,
  trailing,
  footer,
  padded = true,
}: {
  href: string;
  departureIso: string;
  arrivalIso?: string | null;
  from: string;
  to: string;
  place?: string | null;
  priceLabel?: string;
  priceHint?: string;
  occupancy?: { taken: number; total: number; label: string };
  trailing?: ReactNode;
  footer?: ReactNode;
  padded?: boolean;
}) {
  const aside = priceLabel || trailing;

  return (
    <Link
      href={href}
      className={cn(
        'block outline-none transition-all duration-200 hover:bg-muted/80 focus-visible:ring-3 focus-visible:ring-ring/30',
        padded ? 'px-4 py-4 sm:px-5' : 'rounded-md',
      )}
    >
      <div className="grid gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
        <TripWhen iso={departureIso} untilIso={arrivalIso} timeOnly />
        <div className="min-w-0 space-y-1.5">
          <TripRoute from={from} to={to} />
          {place ? <p className="truncate text-xs text-muted-foreground">{place}</p> : null}
          {occupancy ? (
            <OccupancyMeter taken={occupancy.taken} total={occupancy.total} label={occupancy.label} />
          ) : null}
        </div>
        {aside ? (
          <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1.5">
            {priceLabel ? (
              <div className="text-right">
                <p className="font-display text-base font-semibold tabular-nums tracking-tight text-foreground sm:text-lg">
                  {priceLabel}
                </p>
                {priceHint ? (
                  <p className="mt-0.5 max-w-[11rem] text-[11px] leading-tight text-muted-foreground sm:text-xs">
                    {priceHint}
                  </p>
                ) : null}
              </div>
            ) : null}
            {trailing}
          </div>
        ) : null}
      </div>
      {footer}
    </Link>
  );
}
