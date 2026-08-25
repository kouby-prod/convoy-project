import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { TrajetSearchFilters } from '@/components/trajet/trajet-search-filters';
import { TrajetList } from '@/components/trajet/trajet-list';
import { FilterSkeleton, ListSkeleton } from '@/components/ui/list-skeleton';

export default async function TrajetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Trajet');

  return (
    <section className="flex flex-col gap-6">
      <PageHeader className="mb-0" title={t('title')} subtitle={t('subtitle')} />

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[20rem_minmax(0,1fr)]">
        <Suspense fallback={<FilterSkeleton label={t('loading')} />}>
          <TrajetSearchFilters />
        </Suspense>

        <Suspense fallback={<ListSkeleton label={t('loading')} />}>
          <TrajetList />
        </Suspense>
      </div>
    </section>
  );
}
