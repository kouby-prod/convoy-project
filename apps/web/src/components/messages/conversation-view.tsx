'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { fetchConversations } from '@/lib/conversations';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageThread } from '@/components/messages/message-thread';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { cn } from '@/lib/utils';

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

const BOOKING_STATUSES = new Set(['pending', 'awaiting_payment', 'confirmed', 'rejected', 'cancelled', 'expired']);

/**
 * Full thread for one booking: trip + counterpart header, then MessageThread.
 */
export function ConversationView({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Messages');
  const tStatus = useTranslations('Trajets');
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push('/auth/signin');
  }, [isSessionPending, router, session?.user]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['messages', 'inbox'],
    enabled: !!session?.user,
    queryFn: fetchConversations,
  });

  const conversation = data?.find((item) => item.bookingId === bookingId);

  if (isSessionPending || !session?.user || isLoading) {
    return <ListSkeleton rows={4} label={t('loading')} />;
  }

  if (isError) {
    return <p role="alert" className="text-destructive">{t('error')}</p>;
  }

  const statusLabel =
    conversation && BOOKING_STATUSES.has(conversation.bookingStatus)
      ? tStatus(`bookings.status.${conversation.bookingStatus as 'pending'}`)
      : conversation?.bookingStatus;

  return (
    <div className="grid gap-4">
      <Link
        href="/messages"
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}
      >
        <ArrowLeft className="size-4" strokeWidth={2.25} />
        {t('backToInbox')}
      </Link>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">
            {conversation?.counterpart.name || t('counterpartUnknown')}
          </CardTitle>
          {conversation ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                {t('route', {
                  from: conversation.trip.departureCity,
                  to: conversation.trip.arrivalCity,
                })}
              </span>
              <span>{t(`role.${conversation.role}`)}</span>
              <span>
                {t('departureAt')}: {formatDateTime(conversation.trip.departureAt)}
              </span>
              {statusLabel ? (
                <span>
                  {t('status')}: {statusLabel}
                </span>
              ) : null}
              <Link
                href={`/trajet/${conversation.trajetId}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {t('viewTrajet')}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('contextMissing')}</p>
          )}
        </CardHeader>
        <CardContent>
          <MessageThread bookingId={bookingId} variant="full" />
        </CardContent>
      </Card>
    </div>
  );
}
