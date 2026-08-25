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
}: {
  locale: string;
  namespace: InfoNamespace;
}) {
  setRequestLocale(locale);
  const t = await getTranslations(namespace);

  return (
    <LegalPage
      title={t('title')}
      lastUpdated={t('lastUpdated')}
      sections={t.raw('sections') as LegalSection[]}
    />
  );
}
