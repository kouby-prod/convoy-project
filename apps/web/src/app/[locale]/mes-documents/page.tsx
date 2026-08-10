import { setRequestLocale, getTranslations } from 'next-intl/server';
import { MesDocumentsPanel } from '@/components/mes-documents/mes-documents-panel';
import { PageHeader } from '@/components/ui/page-header';

export default async function MesDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Documents');

  return (
    <section className="flex flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <MesDocumentsPanel />
    </section>
  );
}
