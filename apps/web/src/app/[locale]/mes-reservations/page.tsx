import { setRequestLocale, getTranslations } from 'next-intl/server';
import { MesReservationsList } from '@/components/mes-reservations/mes-reservations-list';

/** "Mes réservations" — the passenger's own bookings, with a cancel action. */
export default async function MesReservationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('MesReservations');

  return (
    <section className="flex flex-col gap-8 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <MesReservationsList />
    </section>
  );
}
