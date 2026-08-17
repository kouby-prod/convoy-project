import { setRequestLocale, getTranslations } from 'next-intl/server';
import { PaiementCheckout } from '@/components/paiement/paiement-checkout';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Checkout for the 5 CAD Kouby commission. Server component wraps the
 * client Stripe / PayPal widgets; copy lives in the `Paiement` namespace.
 */
export default async function PaiementPage({
  params,
}: {
  params: Promise<{ locale: string; bookingId: string }>;
}) {
  const { locale, bookingId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Paiement');

  return (
    <section className="flex flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <PaiementCheckout bookingId={bookingId} />
    </section>
  );
}
