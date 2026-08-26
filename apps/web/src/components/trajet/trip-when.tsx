import { useFormatter, useTranslations } from 'next-intl';
import { tripDayKind } from '@/lib/trip-when';
import { cn } from '@/lib/utils';

/** Time on a grouped row, or "Tomorrow · 08:15" when the date is not already nearby. */
export function TripWhen({
  iso,
  untilIso,
  timeOnly,
}: {
  iso: string;
  untilIso?: string | null;
  timeOnly?: boolean;
}) {
  const t = useTranslations('TripWhen');
  const format = useFormatter();
  const date = new Date(iso);
  const kind = tripDayKind(iso);
  const time = format.dateTime(date, { hour: '2-digit', minute: '2-digit' });
  const arrival = untilIso
    ? format.dateTime(new Date(untilIso), { hour: '2-digit', minute: '2-digit' })
    : null;

  if (timeOnly) {
    if (arrival) {
      return (
        <span className="flex items-baseline gap-2 sm:flex-col sm:items-start sm:gap-0.5">
          <time dateTime={iso} className="text-sm font-semibold tabular-nums text-foreground">
            {time}
          </time>
          <time dateTime={untilIso ?? undefined} className="text-sm tabular-nums text-muted-foreground">
            {arrival}
          </time>
        </span>
      );
    }
    return (
      <time dateTime={iso} className="text-sm font-semibold tabular-nums text-foreground">
        {time}
      </time>
    );
  }

  const day =
    kind === 'other'
      ? format.dateTime(date, { weekday: 'short', day: 'numeric', month: 'short' })
      : t(kind);

  return (
    <time dateTime={iso} className="text-sm text-muted-foreground">
      <span className="font-medium capitalize text-foreground">{day}</span>
      <span className="text-muted-foreground"> · </span>
      <span className="tabular-nums font-semibold text-foreground">{time}</span>
    </time>
  );
}

/** Day group label: Today / Tomorrow, else weekday + date without the year. */
export function TripDayHeading({ iso, className }: { iso: string; className?: string }) {
  const t = useTranslations('TripWhen');
  const format = useFormatter();
  const kind = tripDayKind(iso);
  const label =
    kind === 'other'
      ? format.dateTime(new Date(iso), { weekday: 'long', day: 'numeric', month: 'long' })
      : t(kind);

  return <h2 className={cn('capitalize', className)}>{label}</h2>;
}
