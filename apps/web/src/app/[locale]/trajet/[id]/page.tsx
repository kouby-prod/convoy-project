import { setRequestLocale } from 'next-intl/server';
import { TrajetDetail } from '@/components/trajets/trajet-detail';

/**
 * Ride detail — client-fetched against GET /trajets/:id so the same screen can
 * also drive owner actions (PATCH/DELETE), booking management, driver rating,
 * and passenger booking (all already implemented against the API).
 */
export default async function TrajetDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <section className="flex flex-col gap-6 py-2">
      <TrajetDetail id={id} />
    </section>
  );
}
