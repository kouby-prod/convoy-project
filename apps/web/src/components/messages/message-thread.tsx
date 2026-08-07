'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CreateMessageSchema, type Message } from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { MessageCircle, Send } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { useBookingMessagesSocket } from '@/hooks/use-booking-messages-socket';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/i18n/navigation';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const POLL_INTERVAL_MS = 15_000;

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

type MessagePage = {
  items: Message[];
  page: number;
  limit: number;
  hasMore: boolean;
};

export type MessageThreadProps = {
  bookingId: string;
  /** Collapsed toggle for inline booking cards; full thread for the Messages page. */
  variant?: 'full' | 'compact';
  className?: string;
};

/**
 * Shared booking thread — REST history + optional WS live append, with
 * CreateMessageSchema validation on send. Compact mode keeps the old
 * collapsed pattern used on booking cards; full mode is always open.
 */
export function MessageThread({ bookingId, variant = 'full', className }: MessageThreadProps) {
  const t = useTranslations('Messages');
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [isOpen, setIsOpen] = useState(variant === 'full');
  const [body, setBody] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const queryKey = ['bookings', bookingId, 'messages'] as const;
  const enabled = isOpen;
  const socketStatusRef = useRef<'connected' | 'other'>('other');

  const { data, isLoading, isError } = useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      const res = await api.bookings[':bookingId'].messages.$get({
        param: { bookingId },
        query: { limit: '100' },
      });
      if (!res.ok) throw new Error('Failed to load messages');
      return res.json() as Promise<MessagePage>;
    },
    refetchInterval: () => {
      if (!enabled) return false;
      return socketStatusRef.current === 'connected' ? false : POLL_INTERVAL_MS;
    },
  });

  const { status: socketStatus } = useBookingMessagesSocket({
    bookingId,
    enabled,
    onMessage: (message) => {
      queryClient.setQueryData<MessagePage>(queryKey, (current) => {
        if (!current) {
          return { items: [message], page: 1, limit: 100, hasMore: false };
        }
        if (current.items.some((item) => item.id === message.id)) return current;
        return { ...current, items: [...current.items, message] };
      });
    },
  });

  socketStatusRef.current = socketStatus === 'connected' ? 'connected' : 'other';

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [data?.items.length, isOpen]);

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await api.bookings[':bookingId'].messages.$post({
        param: { bookingId },
        json: { body: text },
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json() as Promise<Message>;
    },
    onSuccess: (created) => {
      setBody('');
      setValidationError(null);
      queryClient.setQueryData<MessagePage>(queryKey, (current) => {
        if (!current) {
          return { items: [created], page: 1, limit: 100, hasMore: false };
        }
        if (current.items.some((item) => item.id === created.id)) return current;
        return { ...current, items: [...current.items, created] };
      });
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['messages', 'inbox'] });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateMessageSchema.safeParse({ body: body.trim() });
    if (!parsed.success) {
      setValidationError(t('validationError'));
      return;
    }
    setValidationError(null);
    mutation.mutate(parsed.data.body);
  }

  const liveLabel =
    socketStatus === 'connected'
      ? t('live')
      : socketStatus === 'reconnecting' || socketStatus === 'connecting'
        ? t('reconnecting')
        : t('offline');

  return (
    <div className={cn('grid gap-2', className)}>
      {variant === 'compact' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => setIsOpen((open) => !open)}
          >
            {isOpen ? t('hide') : t('show')}
          </Button>
          <Link
            href={`/messages/${bookingId}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}
          >
            {t('openFull')}
          </Link>
        </div>
      ) : null}

      {isOpen ? (
        <div
          className={cn(
            'grid gap-3 rounded-4xl bg-card p-4 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10',
            variant === 'full' && 'min-h-[24rem]',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageCircle className="size-3.5 shrink-0" strokeWidth={2.25} />
              {liveLabel}
            </p>
          </div>

          {isLoading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
          {isError ? <p className="text-sm text-destructive">{t('error')}</p> : null}
          {!isLoading && !isError && !data?.items.length ? (
            <p className="text-sm text-muted-foreground">{t('threadEmpty')}</p>
          ) : null}

          {data?.items.length ? (
            <ul
              ref={listRef}
              className={cn(
                'grid gap-2 overflow-y-auto pr-1',
                variant === 'full' ? 'max-h-[28rem]' : 'max-h-56',
              )}
            >
              {data.items.map((item) => {
                const isOwn = item.senderId === session?.user?.id;
                return (
                  <li key={item.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-3xl px-3.5 py-2 text-sm shadow-sm',
                        isOwn
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground ring-1 ring-foreground/5',
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

          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t('placeholder')}
              className="min-h-11 flex-1 rounded-3xl"
              maxLength={2000}
              required
              disabled={mutation.isPending}
            />
            <Button
              type="submit"
              size="sm"
              className="self-end"
              disabled={mutation.isPending || !body.trim()}
              aria-label={t('send')}
            >
              {mutation.isPending ? (
                t('sending')
              ) : (
                <>
                  <Send className="size-4" strokeWidth={2.25} />
                  <span className="sr-only sm:not-sr-only sm:ml-1.5">{t('send')}</span>
                </>
              )}
            </Button>
          </form>
          {validationError ? <p className="text-sm text-destructive">{validationError}</p> : null}
          {mutation.isError ? <p className="text-sm text-destructive">{t('sendError')}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
