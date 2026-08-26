const STORAGE_KEY = 'convoy-recent-searches';
const MAX = 5;

export type RecentSearch = {
  from: string;
  to: string;
  date?: string;
  seats?: string;
};

function canUseStorage() {
  return typeof window !== 'undefined';
}

export function readRecentSearches(): RecentSearch[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentSearch => {
        if (!item || typeof item !== 'object') return false;
        const row = item as RecentSearch;
        return (
          typeof row.from === 'string' &&
          typeof row.to === 'string' &&
          row.from.trim().length > 0 &&
          row.to.trim().length > 0
        );
      })
      .slice(0, MAX)
      .map((item) => ({
        from: item.from.trim(),
        to: item.to.trim(),
        date: item.date?.trim() || undefined,
        seats: item.seats?.trim() || undefined,
      }));
  } catch {
    return [];
  }
}

export function rememberSearch(entry: { from: string; to: string; date?: string; seats?: string }): void {
  const from = entry.from.trim();
  const to = entry.to.trim();
  if (!from || !to || !canUseStorage()) return;
  const next: RecentSearch = {
    from,
    to,
    date: entry.date?.trim() || undefined,
    seats: entry.seats?.trim() || undefined,
  };
  const rest = readRecentSearches().filter(
    (item) => !(item.from.toLowerCase() === from.toLowerCase() && item.to.toLowerCase() === to.toLowerCase()),
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...rest].slice(0, MAX)));
}

export function recentSearchHref(entry: RecentSearch): string {
  const params = new URLSearchParams();
  params.set('from', entry.from);
  params.set('to', entry.to);
  if (entry.date) params.set('date', entry.date);
  if (entry.seats) params.set('seats', entry.seats);
  return `/trajet?${params.toString()}`;
}

export function recentSearchKey(entry: RecentSearch): string {
  return `${entry.from}|${entry.to}|${entry.date ?? ''}|${entry.seats ?? ''}`;
}
