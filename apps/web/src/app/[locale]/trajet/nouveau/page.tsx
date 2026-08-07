import { setRequestLocale, getTranslations } from 'next-intl/server';
import { TrajetCreateForm } from '@/components/trajet/trajet-create-form';

/**
 * Publish a ride. One screen, one form — deliberately the shortest path
 * between "I have free seats" and a live listing on /trajet.
 */
export default async function NewTrajetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Trajet');

  return (
    <section className="flex flex-col gap-8 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('create.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('create.subtitle')}</p>
      </div>

      <TrajetCreateForm />
    </section>
  );
}
