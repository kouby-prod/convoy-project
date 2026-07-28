import { setRequestLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { TrajetsList } from '@/components/trajets/trajets-list';
import { Button } from '@/components/ui/button';

/**
 * Trajets page. Server component: locale-aware, statically rendered.
 * All copy comes from the `Trajets` next-intl namespace — add the
 * keys to BOTH messages/fr.json (primary) and messages/en.json.
 */
export default async function TrajetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Trajets');
  const tNav = await getTranslations('Navbar');

  return (
    <section className="flex flex-col gap-8 py-12">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link href={`/${locale}/annoncer`}>
          <Button>{tNav('post')}</Button>
        </Link>
      </div>

      <TrajetsList />
    </section>
  );
}
