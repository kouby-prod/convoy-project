import { setRequestLocale, getTranslations } from 'next-intl/server';
import { TrajetDetail } from '@/components/trajets/trajet-detail';

export default async function TrajetDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Trajets');

  return (
    <section className="flex flex-col gap-8 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('detailTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('detailSubtitle')}</p>
      </div>

      <TrajetDetail id={id} />
    </section>
  );
}
