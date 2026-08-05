import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { TrajetsList } from '@/components/trajets/trajets-list';
import { Button } from '@/components/ui/button';

/**
 * Search page — the navbar's "Rechercher" entry point. Reuses `TrajetsList`
 * (the same search form, filters and paginated results shown at /trajets)
 * rather than duplicating that query/filter logic; only the header copy
 * differs, via the `Search` next-intl namespace.
 */
export default async function SearchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Search');
  const tTrajets = await getTranslations('Trajets');
  const tNav = await getTranslations('Navbar');

  return (
    <section className="flex flex-col gap-8 py-12">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link href={`/${locale}/annoncer`}>
          <Button>{tNav('post')}</Button>
        </Link>
      </div>

      <Suspense fallback={<p className="text-muted-foreground">{tTrajets('loading')}</p>}>
        <TrajetsList />
      </Suspense>
    </section>
  );
}
