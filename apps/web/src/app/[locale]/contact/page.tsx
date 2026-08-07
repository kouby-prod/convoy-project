import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ContactForm } from '@/components/contact/contact-form';
import { PageHeader } from '@/components/ui/page-header';

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Contact');

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <ContactForm />
    </section>
  );
}
