import { setRequestLocale, getTranslations } from 'next-intl/server';
import { TrajetCreateForm } from '@/components/trajet/trajet-create-form';
import { PageHeader } from '@/components/ui/page-header';

export default async function NewTrajetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Trajet');

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <PageHeader title={t('create.title')} subtitle={t('create.subtitle')} className="sm:items-center sm:text-center" />
      <TrajetCreateForm />
    </section>
  );
}
