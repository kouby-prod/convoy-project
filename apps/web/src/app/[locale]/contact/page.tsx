import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ContactForm } from '@/components/contact/contact-form';

/**
 * Contact / customer support page. Server component: locale-aware,
 * statically rendered. All copy comes from the `Contact` next-intl
 * namespace — add the keys to BOTH messages/fr.json (primary) and
 * messages/en.json.
 */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Contact');

  return (
    <section className="flex flex-col gap-8 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <ContactForm />
    </section>
  );
}
