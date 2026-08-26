import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { TrajetSearchFilters } from '@/components/trajet/trajet-search-filters';
import { TrajetList } from '@/components/trajet/trajet-list';

export default async function TrajetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Trajet');

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Link href="/trajet/nouveau" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
            {t('create.cta')}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
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
