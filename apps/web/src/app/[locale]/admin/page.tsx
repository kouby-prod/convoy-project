import { setRequestLocale, getTranslations } from 'next-intl/server';
import { AdminDashboard } from '@/components/admin/admin-dashboard';

/**
 * `/admin` — the backoffice. Server component: locale-aware, statically
 * rendered; the dashboard below is the client half (session, filters, review
 * actions).
 *
 * The page itself is not a security boundary — every route it calls enforces
 * `requireRole('admin')` on the API side, and the dashboard renders the refusal
 * when that check says no.
 */
export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Admin');

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <AdminDashboard />
    </section>
  );
}
