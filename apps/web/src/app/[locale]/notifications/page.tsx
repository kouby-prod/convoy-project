import { setRequestLocale, getTranslations } from 'next-intl/server';
import { NotificationsList } from '@/components/notifications/notifications-list';
import { PageHeader } from '@/components/ui/page-header';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Notifications');

  return (
    <section className="flex flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <NotificationsList />
    </section>
  );
}
