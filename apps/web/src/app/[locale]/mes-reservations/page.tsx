import { setRequestLocale, getTranslations } from 'next-intl/server';
import { MesReservationsList } from '@/components/mes-reservations/mes-reservations-list';
import { PageHeader } from '@/components/ui/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export default async function MesReservationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('MesReservations');

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title={t('title')}
        className="mb-0"
        actions={
          <Link
            href="/trajet"
            className={cn(buttonVariants({ variant: 'primary' }), 'w-full font-semibold sm:w-auto')}
          >
            {t('emptyCta')}
          </Link>
        }
      />
      <MesReservationsList />
    </section>
  );
}
