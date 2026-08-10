import { setRequestLocale, getTranslations } from 'next-intl/server';
import { MessagesList } from '@/components/messages/messages-list';
import { PageHeader } from '@/components/ui/page-header';

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Messages');

  return (
    <section className="flex flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <MessagesList />
    </section>
  );
}
