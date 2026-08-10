import { setRequestLocale, getTranslations } from 'next-intl/server';
import { MesReservationsList } from '@/components/mes-reservations/mes-reservations-list';
import { PageHeader } from '@/components/ui/page-header';

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
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <MesReservationsList />
    </section>
  );
}
