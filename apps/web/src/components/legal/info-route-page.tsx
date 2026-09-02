import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LegalPage, type LegalSection } from '@/components/legal/legal-page';

export type InfoNamespace =
  | 'Responsibility'
  | 'BecomeDriver'
  | 'BecomePassenger'
  | 'PassengerTips'
  | 'DriverTips';

export async function InfoRoutePage({
  locale,
  namespace,
  pdfHref,
}: {
  locale: string;
  namespace: InfoNamespace;
  pdfHref?: string;
}) {
  setRequestLocale(locale);
  const t = await getTranslations(namespace);
  const tLegal = await getTranslations('LegalPage');

  return (
    <LegalPage
      title={t('title')}
      lastUpdated={t('lastUpdated')}
      sections={t.raw('sections') as LegalSection[]}
      pdfHref={pdfHref}
      downloadLabel={pdfHref ? tLegal('downloadPdf') : undefined}
      backLabel={tLegal('back')}
    />
  );
}
