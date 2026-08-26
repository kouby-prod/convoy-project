export type TripDayKind = 'today' | 'tomorrow' | 'yesterday' | 'other';

/** Local calendar day `YYYY-MM-DD` — never `toISOString()`, which shifts TZ. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function tripDayKind(iso: string, now = new Date()): TripDayKind {
  const date = new Date(iso);
  const startLocal = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((startLocal(date) - startLocal(now)) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return 'other';
}

export function groupByDateKey<T>(items: T[], iso: (item: T) => string): [string, T[]][] {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const key = toDateKey(new Date(iso(item)));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }
  return [...byDay.entries()];
}
