'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowRight, MessageSquare } from 'lucide-react';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { fetchConversations } from '@/lib/conversations';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

const BOOKING_STATUSES = new Set(['pending', 'confirmed', 'rejected', 'cancelled', 'expired']);

/**
 * Messages inbox — `GET /messages/conversations` with trip context,
 * counterpart name, and last-message preview.
 */
export function MessagesList() {
  const t = useTranslations('Messages');
  const tStatus = useTranslations('Trajets');
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push('/sign-in');
  }, [isSessionPending, router, session?.user]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['messages', 'inbox'],
    enabled: !!session?.user,
    queryFn: fetchConversations,
  });

  if (isSessionPending || !session?.user) {
    return <p className="text-muted-foreground">{t('loading')}</p>;
  }
  if (isLoading) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isError) return <p className="text-destructive">{t('error')}</p>;
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/40 px-6 py-12 text-center ring-1 ring-foreground/5">
        <MessageSquare className="size-10 text-muted-foreground" strokeWidth={1.75} />
        <p className="max-w-sm text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3">
      {data.map((item) => {
        const statusLabel = BOOKING_STATUSES.has(item.bookingStatus)
          ? tStatus(`bookings.status.${item.bookingStatus as 'pending'}`)
          : item.bookingStatus;

        return (
          <li key={item.bookingId}>
            <Link href={`/messages/${item.bookingId}`} className="block outline-none">
              <Card className="transition-all duration-200 hover:bg-accent/60 focus-within:ring-3 focus-within:ring-ring/30">
                <CardContent className="flex items-center gap-4 p-5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <MessageSquare className="size-5" strokeWidth={2.25} />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="truncate text-base font-semibold tracking-tight text-foreground">
                        {item.counterpart.name || t('counterpartUnknown')}
                      </p>
                      {item.lastMessage ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDateTime(item.lastMessage.createdAt)}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {t('route', {
                        from: item.trip.departureCity,
                        to: item.trip.arrivalCity,
                      })}
                      {' · '}
                      {t(`role.${item.role}`)}
                    </p>
                    <p className="truncate text-sm text-foreground/80">
                      {item.lastMessage?.body ?? t('threadEmpty')}
                    </p>
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                        item.bookingStatus === 'confirmed'
                          ? 'bg-primary/10 text-primary'
                          : item.bookingStatus === 'pending'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <ArrowRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={2} />
                </CardContent>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
