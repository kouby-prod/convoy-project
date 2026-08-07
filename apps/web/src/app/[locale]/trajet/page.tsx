import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { TrajetSearchFilters } from '@/components/trajet/trajet-search-filters';
import { TrajetList } from '@/components/trajet/trajet-list';

/**
 * Trajet search page: the filter rail on the left, the matching rides on the
 * right. Both halves read/write the URL query string so a search is shareable —
 * which is why they sit under <Suspense>: `useSearchParams` opts its subtree
 * into client-side rendering.
 *
 * All copy comes from the `Trajet` next-intl namespace (fr.json + en.json).
 */
export default async function TrajetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Trajet');

  return (
    <section className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Link href="/trajet/nouveau" className={buttonVariants({ variant: 'primary' })}>
          {t('create.cta')}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[19rem_1fr] lg:items-start">
        <Suspense fallback={null}>
          <TrajetSearchFilters />
        </Suspense>

        <Suspense fallback={null}>
          <TrajetList />
        </Suspense>
      </div>
    </section>
  );
}
