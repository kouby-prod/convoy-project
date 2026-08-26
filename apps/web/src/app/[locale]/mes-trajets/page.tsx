import { setRequestLocale, getTranslations } from 'next-intl/server';
import { MesTrajetsList } from '@/components/mes-trajets/mes-trajets-list';
import { PageHeader } from '@/components/ui/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export default async function MesTrajetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('MesTrajets');

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title={t('title')}
        className="mb-0"
        actions={
          <Link
            href="/trajet/nouveau"
            className={cn(buttonVariants({ variant: 'primary' }), 'w-full font-semibold sm:w-auto')}
          >
            {t('post')}
          </Link>
        }
      />
      <MesTrajetsList />
    </section>
  );
}
