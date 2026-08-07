import { setRequestLocale, getTranslations } from 'next-intl/server';
import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { PageHeader } from '@/components/ui/page-header';

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Admin');

  return (
    <section className="flex flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <AdminDashboard />
    </section>
  );
}
