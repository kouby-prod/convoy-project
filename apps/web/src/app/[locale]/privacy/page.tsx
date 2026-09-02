import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LegalPage, type LegalSection } from '@/components/legal/legal-page';

/**
 * Privacy policy (PIPEDA) page. Static content — server component, no
 * interactivity. All copy comes from the `Privacy` next-intl namespace —
 * add the keys to BOTH messages/fr.json (primary) and messages/en.json.
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Privacy');
  const tLegal = await getTranslations('LegalPage');

  return (
    <LegalPage
      title={t('title')}
      disclaimer={t('disclaimer')}
      lastUpdated={t('lastUpdated')}
      sections={t.raw('sections') as LegalSection[]}
      pdfHref={`/${locale}/privacy/pdf`}
      downloadLabel={tLegal('downloadPdf')}
      backLabel={tLegal('back')}
    />
  );
}
