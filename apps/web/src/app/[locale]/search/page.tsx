import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { TrajetsList } from '@/components/trajets/trajets-list';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

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
    <section className="flex flex-col gap-8">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Link href="/trajet/nouveau" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
            {tNav('post')}
          </Link>
        }
      />

      <Suspense fallback={<p className="text-muted-foreground">{tTrajets('loading')}</p>}>
        <TrajetsList />
      </Suspense>
    </section>
  );
}
