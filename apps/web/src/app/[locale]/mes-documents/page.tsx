import { setRequestLocale, getTranslations } from 'next-intl/server';
import { MesDocumentsPanel } from '@/components/mes-documents/mes-documents-panel';

/**
 * `/mes-documents` — where a driver sends their identity papers and follows the
 * review. Server component: locale-aware, statically rendered; the panel below
 * is the client half (it needs the session and the upload form).
 *
 * All copy comes from the `Documents` next-intl namespace, shared with the
 * backoffice so a status reads the same on both sides.
 */
export default async function MesDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Documents');

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <MesDocumentsPanel />
    </section>
  );
}
