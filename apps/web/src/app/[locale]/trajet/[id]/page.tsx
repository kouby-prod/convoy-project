import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { TrajetDetail } from '@/components/trajet/trajet-detail';
import { TrajetBookingForm } from '@/components/trajet/trajet-booking-form';
import { fetchTrajet } from '@/lib/trajets';

/**
 * A single ride: summary band, driver/vehicle profile, then the booking form.
 * Server component — the ride is fetched on the server; only the form is
 * interactive.
 */
export default async function TrajetDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const trajet = await fetchTrajet(id);
  if (!trajet) notFound();

  const t = await getTranslations('Trajet');

  return (
    <section className="flex flex-col gap-10 py-8">
      <TrajetDetail trajet={trajet} />

      <div className="flex flex-col gap-6">
        <h2 className="text-center text-lg font-semibold tracking-tight text-foreground">
          {t('booking.title')}
        </h2>
        <TrajetBookingForm trajetId={trajet.id} seatsAvailable={trajet.seatsAvailable} />
      </div>
    </section>
  );
}
