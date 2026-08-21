import { setRequestLocale } from 'next-intl/server';
import { MessagesInbox } from '@/components/messages/messages-inbox';

/**
 * Single booking conversation. Same split-pane as the inbox; mobile shows
 * the thread full-bleed with a back control.
 */
export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ locale: string; bookingId: string }>;
}) {
  const { locale, bookingId } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessagesInbox selectedId={bookingId} />
    </div>
  );
}
