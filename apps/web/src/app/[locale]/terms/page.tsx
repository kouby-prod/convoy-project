import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LegalPage, type LegalSection } from '@/components/legal/legal-page';

/**
 * Terms of service (CGU) page. Static content — server component, no
 * interactivity. All copy comes from the `Terms` next-intl namespace — add
 * the keys to BOTH messages/fr.json (primary) and messages/en.json.
 */
export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Terms');
  const tLegal = await getTranslations('LegalPage');

  return (
    <LegalPage
      title={t('title')}
      disclaimer={t('disclaimer')}
      lastUpdated={t('lastUpdated')}
      sections={t.raw('sections') as LegalSection[]}
      pdfHref={`/${locale}/terms/pdf`}
      downloadLabel={tLegal('downloadPdf')}
    />
  );
}
