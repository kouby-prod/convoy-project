'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

/**
 * Inline message thread for one booking, shared by the driver's
 * booking-management view and the passenger's booking views (current
 * session + history) — either the trajet's driver or the booking's
 * passenger can read and post here (enforced server-side), independent of
 * the booking's status. Collapsed by default and only fetches once opened,
 * since most bookings never need it.
 *
 * Threads are expected to stay short (one trip, two people), so this fetches
 * a single generous page (`limit=100`) instead of building infinite-scroll
 * pagination for messages.
 */
export function BookingMessages({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Messages');
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [body, setBody] = useState('');

  const queryKey = ['bookings', bookingId, 'messages'];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    enabled: isOpen,
    queryFn: async () => {
      const res = await api.bookings[':bookingId'].messages.$get({
        param: { bookingId },
        query: { limit: '100' },
      });
      if (!res.ok) throw new Error('Failed to load messages');
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.bookings[':bookingId'].messages.$post({
        param: { bookingId },
        json: { body },
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    },
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? t('hide') : t('show')}
      </Button>

      {isOpen ? (
        <div className="grid gap-3 rounded-md border p-3">
          {isLoading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
          {isError ? <p className="text-sm text-destructive">{t('error')}</p> : null}
          {!isLoading && !isError && !data?.items.length ? (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          ) : null}

          {data?.items.length ? (
            <ul className="grid gap-2">
              {data.items.map((item) => {
                const isOwn = item.senderId === session?.user?.id;
                return (
                  <li key={item.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                        isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{item.body}</p>
                      <p
                        className={cn(
                          'mt-1 text-xs',
                          isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground',
                        )}
                      >
                        {formatTime(item.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (body.trim()) mutation.mutate();
            }}
            className="flex gap-2"
          >
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t('placeholder')}
              className="min-h-10 flex-1"
            />
            <Button
              type="submit"
              size="sm"
              className="self-end"
              disabled={mutation.isPending || !body.trim()}
            >
              {mutation.isPending ? t('sending') : t('send')}
            </Button>
          </form>
          {mutation.isError ? <p className="text-sm text-destructive">{t('sendError')}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
