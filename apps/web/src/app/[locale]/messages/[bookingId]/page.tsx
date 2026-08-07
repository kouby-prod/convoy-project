import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ConversationView } from '@/components/messages/conversation-view';

/**
 * Single booking conversation. Server shell; thread UI is client-side
 * (auth, TanStack Query, optional WebSocket).
 */
export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ locale: string; bookingId: string }>;
}) {
  const { locale, bookingId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Messages');

  return (
    <section className="flex flex-col gap-8 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('threadTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('threadSubtitle')}</p>
      </div>

      <ConversationView bookingId={bookingId} />
    </section>
  );
}
