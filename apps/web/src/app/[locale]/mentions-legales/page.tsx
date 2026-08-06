import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LegalPage, type LegalSection } from '@/components/legal/legal-page';

/**
 * Legal notice (Mentions Légales) page. Static content — server component,
 * no interactivity. All copy comes from the `MentionsLegales` next-intl
 * namespace — add the keys to BOTH messages/fr.json (primary) and
 * messages/en.json.
 */
export default async function MentionsLegalesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('MentionsLegales');

  return (
    <LegalPage
      title={t('title')}
      disclaimer={t('disclaimer')}
      lastUpdated={t('lastUpdated')}
      sections={t.raw('sections') as LegalSection[]}
    />
  );
}
