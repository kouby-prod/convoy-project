'use client';

import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useInboxUnreadCount } from '@/hooks/use-message-read';
import { UnreadBadge } from '@/components/messages/unread-badge';
import { cn } from '@/lib/utils';

/** Chrome shortcut to the inbox, with an unread count. */
export function MessagesNavLink({ className }: { className?: string }) {
  const t = useTranslations('Navbar');
  const pathname = usePathname();
  const unread = useInboxUnreadCount();
  const active = pathname === '/messages' || pathname.startsWith('/messages/');

  return (
    <Link
      href="/messages"
      aria-label={unread > 0 ? `${t('messages')} (${unread})` : t('messages')}
      className={cn(
        'relative inline-flex size-10 items-center justify-center rounded-md text-white outline-none transition-all duration-200 hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/40',
        active && 'bg-white/20',
        className,
      )}
    >
      <MessageSquare className="size-5" strokeWidth={2.25} aria-hidden />
      <UnreadBadge count={unread} className="absolute -right-0.5 -top-0.5 min-w-4 px-1" />
    </Link>
  );
}
