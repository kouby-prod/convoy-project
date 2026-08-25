import { setRequestLocale } from 'next-intl/server';
import { PaiementCheckout } from '@/components/paiement/paiement-checkout';

/**
 * Checkout after the driver accepts. Card bookings collect fare + commission;
 * Interac/cash collect the 4 CAD commission only.
 */
export default async function PaiementPage({
  params,
}: {
  params: Promise<{ locale: string; bookingId: string }>;
}) {
  const { locale, bookingId } = await params;
  setRequestLocale(locale);

  return <PaiementCheckout bookingId={bookingId} />;
}
