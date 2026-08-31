import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LegalPage, type LegalSection } from '@/components/legal/legal-page';

/**
 * Driver agreement (Contrat Conducteur) page. Static content — server
 * component, no interactivity. All copy comes from the `ContratConducteur`
 * next-intl namespace — add the keys to BOTH messages/fr.json (primary) and
 * messages/en.json.
 */
export default async function ContratConducteurPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('ContratConducteur');
  const tLegal = await getTranslations('LegalPage');

  return (
    <LegalPage
      title={t('title')}
      disclaimer={t('disclaimer')}
      lastUpdated={t('lastUpdated')}
      sections={t.raw('sections') as LegalSection[]}
      pdfHref={`/${locale}/contrat-conducteur/pdf`}
      downloadLabel={tLegal('downloadPdf')}
      backLabel={tLegal('back')}
    />
  );
}
