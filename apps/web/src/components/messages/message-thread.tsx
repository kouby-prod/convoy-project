'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { CreateMessageSchema, type Message } from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { Send } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { toDateKey, tripDayKind } from '@/lib/trip-when';
import { useBookingMessagesSocket } from '@/hooks/use-booking-messages-socket';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ThreadSkeleton } from '@/components/ui/list-skeleton';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const POLL_INTERVAL_MS = 15_000;

type MessagePage = {
  items: Message[];
  page: number;
  limit: number;
  hasMore: boolean;
};

export type MessageThreadProps = {
  bookingId: string;
  /** Compact keeps a collapse toggle. Pane is always open (inbox + driver case). */
  variant?: 'full' | 'compact' | 'pane';
  className?: string;
  /** I’m here / running late — only during a live booking. */
  pickupHints?: boolean;
};

/**
 * Shared booking thread — REST history + optional WS live append.
 * Enter sends; Shift+Enter inserts a newline. Day separators, time on the
 * last bubble of each day.
 */
export function MessageThread({
  bookingId,
  variant = 'full',
  className,
  pickupHints = false,
}: MessageThreadProps) {
  const t = useTranslations('Messages');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [isOpen, setIsOpen] = useState(variant !== 'compact');
  const [body, setBody] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const sendHintId = useId();
  const lastAnnouncedId = useRef<string | null>(null);
  const [liveIncoming, setLiveIncoming] = useState('');

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

  function send() {
    const parsed = CreateMessageSchema.safeParse({ body: body.trim() });
    if (!parsed.success) {
      setValidationError(t('validationError'));
      return;
    }
    setValidationError(null);
    mutation.mutate(parsed.data.body);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  const liveLabel =
    socketStatus === 'connected'
      ? t('live')
      : socketStatus === 'reconnecting' || socketStatus === 'connecting'
        ? t('reconnecting')
        : t('offline');

  const items = data?.items ?? [];

  useEffect(() => {
    const incoming = items.filter((item) => item.senderId !== session?.user?.id);
    const latest = incoming.at(-1);
    if (!latest) return;
    if (lastAnnouncedId.current === null) {
      lastAnnouncedId.current = latest.id;
      return;
    }
    if (latest.id === lastAnnouncedId.current) return;
    lastAnnouncedId.current = latest.id;
    setLiveIncoming(t('newMessage', { preview: latest.body.slice(0, 80) }));
  }, [items, session?.user?.id, t]);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {variant === 'compact' ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mb-2 w-fit"
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? t('hide') : t('show')}
        </Button>
      ) : null}

      {isOpen ? (
        <>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {liveIncoming}
          </p>
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col',
              variant === 'compact' && 'rounded-lg bg-card p-4 ring-1 ring-foreground/5',
            )}
          >
            {isLoading ? <ThreadSkeleton label={t('loading')} /> : null}
            {isError ? <p role="alert" className="p-3 text-sm text-destructive">{t('error')}</p> : null}
            {!isLoading && !isError && !items.length ? (
              <p className="m-auto p-6 text-center text-sm text-muted-foreground">{t('threadEmpty')}</p>
            ) : null}

            {items.length ? (
              <ul ref={listRef} className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-1 py-2">
                {items.map((item, index) => {
                  const isOwn = item.senderId === session?.user?.id;
                  const prev = items[index - 1];
                  const next = items[index + 1];
                  const day = toDateKey(new Date(item.createdAt));
                  const showDay = !prev || toDateKey(new Date(prev.createdAt)) !== day;
                  const showTime = !next || toDateKey(new Date(next.createdAt)) !== day;
                  return (
                    <li key={item.id} className="grid gap-2">
                      {showDay ? <DaySeparator iso={item.createdAt} /> : null}
                      <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-md px-3.5 py-2 text-sm',
                            isOwn
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-foreground ring-1 ring-foreground/5',
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{item.body}</p>
                          {showTime ? (
                            <p
                              className={cn(
                                'mt-1 text-xs tabular-nums',
                                isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground',
                              )}
                            >
                              {formatClock(item.createdAt, locale)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex shrink-0 flex-col gap-2 border-t border-border bg-card px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            {pickupHints ? (
              <div className="flex flex-wrap gap-2">
                <QuickReply
                  label={t('quick.here')}
                  disabled={mutation.isPending}
                  onSend={(text) => mutation.mutate(text)}
                />
                <QuickReply
                  label={t('quick.late')}
                  disabled={mutation.isPending}
                  onSend={(text) => mutation.mutate(text)}
                />
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <Textarea
                name="body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('placeholder')}
                className="min-h-11 max-h-32 flex-1 resize-none rounded-md"
                maxLength={2000}
                rows={1}
                required
                disabled={mutation.isPending}
                aria-describedby={sendHintId}
              />
              <Button
                type="submit"
                size="sm"
                className="min-h-11 self-end"
                disabled={mutation.isPending || !body.trim()}
                aria-label={t('send')}
                title={liveLabel}
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
            </div>
          </form>
          <p id={sendHintId} className="sr-only">
            {t('sendHint')}
          </p>
          {validationError ? <p role="alert" className="px-3 pb-2 text-sm text-destructive">{validationError}</p> : null}
          {mutation.isError ? <p role="alert" className="px-3 pb-2 text-sm text-destructive">{t('sendError')}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function QuickReply({
  label,
  disabled,
  onSend,
}: {
  label: string;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSend(label)}
      className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground outline-none ring-1 ring-foreground/10 transition-all duration-200 hover:bg-muted/80 focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function formatClock(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-CA' : 'fr-CA', { timeStyle: 'short' }).format(
    new Date(value),
  );
}

function DaySeparator({ iso }: { iso: string }) {
  const t = useTranslations('Messages');
  const locale = useLocale();
  const kind = tripDayKind(iso);
  const label =
    kind === 'today'
      ? t('day.today')
      : kind === 'yesterday'
        ? t('day.yesterday')
        : new Intl.DateTimeFormat(locale === 'en' ? 'en-CA' : 'fr-CA', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }).format(new Date(iso));

  return (
    <p className="py-1 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
  );
}
