import { InfoRoutePage } from '@/components/legal/info-route-page';

export default async function ResponsibilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <InfoRoutePage locale={locale} namespace="Responsibility" pdfHref={`/${locale}/responsibility/pdf`} />;
}
