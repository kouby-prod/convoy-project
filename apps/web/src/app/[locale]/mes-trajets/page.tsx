import { setRequestLocale, getTranslations } from 'next-intl/server';
import { MesTrajetsList } from '@/components/mes-trajets/mes-trajets-list';
import { PageHeader } from '@/components/ui/page-header';

export default async function MesTrajetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('MesTrajets');

  return (
    <section className="flex flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <MesTrajetsList />
    </section>
  );
}
