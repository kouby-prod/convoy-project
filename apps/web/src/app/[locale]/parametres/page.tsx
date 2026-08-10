import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ParametresForm } from '@/components/parametres/parametres-form';
import { PageHeader } from '@/components/ui/page-header';

export default async function ParametresPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Parametres');

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <ParametresForm />
    </section>
  );
}
