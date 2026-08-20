import { InfoRoutePage } from '@/components/legal/info-route-page';

export default async function BecomePassengerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <InfoRoutePage locale={locale} namespace="BecomePassenger" />;
}
