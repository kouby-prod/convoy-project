import { redirect } from 'next/navigation';

function localePath(locale: string, pathname: string) {
  return locale === 'fr' ? pathname : `/${locale}${pathname}`;
}

function queryString(search: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Legacy discovery URL — same product as `/trajet`. */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  redirect(localePath(locale, `/trajet${queryString(query)}`));
}
