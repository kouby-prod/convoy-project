import { setRequestLocale } from 'next-intl/server';
import { MessagesInbox } from '@/components/messages/messages-inbox';

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessagesInbox />
    </div>
  );
}
