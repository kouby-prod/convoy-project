import { cn } from '@/lib/utils';

export interface ItineraryStop {
  timeLabel: string;
  city: string;
  place?: string | null;
  timeMuted?: boolean;
}

interface ItineraryTimelineProps {
  dateLabel: string;
  departure: ItineraryStop;
  arrival: ItineraryStop;
  durationLabel?: string | null;
  className?: string;
}

/**
 * BlaBlaCar-style itinerary:
 * each row owns its rail segment so the line always meets the dots.
 *
 *  09:30  ●  Nice
 *         │  Gare Thiers
 *         │  2 h 30
 *  12:00  ●  Marseille
 *            Saint-Charles
 */
export function ItineraryTimeline({
  dateLabel,
  departure,
  arrival,
  durationLabel,
  className,
}: ItineraryTimelineProps) {
  return (
    <section
      className={cn(
        'max-w-xl rounded-lg bg-card px-5 py-6 shadow-sm ring-1 ring-foreground/5 sm:px-7 sm:py-7',
        className,
      )}
      aria-label={`${departure.city} → ${arrival.city}`}
    >
      <p className="text-sm font-medium capitalize text-muted-foreground">{dateLabel}</p>

      <ol className="mt-6 flex flex-col">
        {/* Departure — rail continues under the content */}
        <li className="flex items-stretch gap-4">
          <TimeLabel stop={departure} />
          <div className="flex w-3 shrink-0 flex-col items-center">
            <span className="mt-1 size-3 shrink-0 rounded-full bg-brand-green" aria-hidden />
            <span className="w-0.5 flex-1 bg-border" aria-hidden />
          </div>
          <StopCopy stop={departure} className="pb-2" />
        </li>

        {/* Duration — centered in a taller mid beat on the rail */}
        <li className="flex min-h-14 items-stretch gap-4">
          <div className="w-14 shrink-0 sm:w-16" aria-hidden />
          <div className="flex w-3 shrink-0 flex-col items-center" aria-hidden>
            <span className="w-0.5 flex-1 bg-border" />
          </div>
          <p className="flex flex-1 items-center text-xs font-semibold tabular-nums tracking-wide text-muted-foreground whitespace-nowrap">
            {durationLabel ?? '\u00a0'}
          </p>
        </li>

        {/* Arrival — short stub continues the rail into the blue dot */}
        <li className="flex items-start gap-4">
          <TimeLabel stop={arrival} />
          <div className="flex w-3 shrink-0 flex-col items-center">
            <span className="h-1 w-0.5 shrink-0 bg-border" aria-hidden />
            <span className="size-3 shrink-0 rounded-full bg-brand-blue" aria-hidden />
          </div>
          <StopCopy stop={arrival} />
        </li>
      </ol>
    </section>
  );
}

function TimeLabel({ stop }: { stop: ItineraryStop }) {
  return (
    <p
      className={cn(
        'w-14 shrink-0 pt-0.5 text-right text-base font-semibold tabular-nums leading-none sm:w-16 sm:text-lg',
        stop.timeMuted ? 'font-medium text-muted-foreground' : 'text-foreground',
      )}
    >
      <time>{stop.timeLabel}</time>
    </p>
  );
}

function StopCopy({ stop, className }: { stop: ItineraryStop; className?: string }) {
  return (
    <div className={cn('min-w-0 flex-1', className)}>
      <p className="font-display text-xl font-semibold leading-none tracking-tight text-foreground sm:text-2xl">
        {stop.city}
      </p>
      {stop.place ? (
        <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{stop.place}</p>
      ) : null}
    </div>
  );
}

export function formatTripDuration(
  start: Date,
  end: Date,
  labels: {
    minutes: (n: number) => string;
    hours: (n: number) => string;
    full: (h: number, m: number) => string;
  },
): string | null {
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return labels.minutes(Math.max(minutes, 1));
  if (minutes === 0) return labels.hours(hours);
  return labels.full(hours, minutes);
}
