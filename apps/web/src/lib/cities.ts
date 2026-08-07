/**
 * City suggestions for search / publish forms.
 * Names match the seeded trajet city table so autocomplete hits real inventory.
 */
export const SERVICE_CITIES = [
  'Montréal',
  'Québec',
  'Gatineau',
  'Sherbrooke',
  'Trois-Rivières',
  'Laval',
  'Longueuil',
  'Saguenay',
  'Drummondville',
  'Rimouski',
  'Ottawa',
  'Granby',
  'Toronto',
] as const;

/** Strip accents + case for tolerant matching (Montréal ↔ montreal). */
export function normalizeCityQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export function filterCities(query: string, limit = 8): string[] {
  const needle = normalizeCityQuery(query);
  if (!needle) return [...SERVICE_CITIES].slice(0, limit);

  const startsWith: string[] = [];
  const contains: string[] = [];

  for (const city of SERVICE_CITIES) {
    const haystack = normalizeCityQuery(city);
    if (haystack.startsWith(needle)) startsWith.push(city);
    else if (haystack.includes(needle)) contains.push(city);
  }

  return [...startsWith, ...contains].slice(0, limit);
}
