import { setRequestLocale, getTranslations } from 'next-intl/server';
import { MesTrajetsList } from '@/components/mes-trajets/mes-trajets-list';

/**
 * "Mes trajets" — the driver's own published trajets (history + entry point
 * into managing bookings via TrajetBookings on each trajet's detail page).
 */
export default async function MesTrajetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('MesTrajets');

  return (
    <section className="flex flex-col gap-8 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <MesTrajetsList />
    </section>
  );
}
