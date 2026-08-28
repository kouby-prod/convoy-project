import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message, MessagePage } from '@carpool/schemas';
import { api } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { useBookingMessagesSocket } from '@/hooks/useBookingMessagesSocket';
import { useMessageReadMap } from '@/hooks/useMessageReadMap';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState } from '@/components/ui/StateMessage';
import { colors, radius, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

/**
 * Full-screen conversation for one booking thread — mobile counterpart of
 * the web's `MessageThread`. Unlike `components/trajets/BookingMessages`
 * (an inline, collapsible widget), this is always open and marks the
 * thread read on mount, since it IS the screen the driver/passenger is on.
 */
export function MessageThread({ bookingId }: { bookingId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { markRead } = useMessageReadMap();
  const [body, setBody] = useState('');
  const queryKey = ['bookings', bookingId, 'messages'] as const;

  useEffect(() => {
    markRead(bookingId);
  }, [bookingId, markRead]);

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.bookings[':bookingId'].messages.$get({ param: { bookingId }, query: { limit: '100' } });
      if (!res.ok) throw new Error('Failed to load messages');
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.bookings[':bookingId'].messages.$post({ param: { bookingId }, json: { body } });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    },
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey });
      markRead(bookingId);
    },
  });

  useBookingMessagesSocket({
    bookingId,
    onMessage: (message: Message) => {
      queryClient.setQueryData<MessagePage>(queryKey, (current) => {
        if (!current) return current;
        if (current.items.some((item) => item.id === message.id)) return current;
        return { ...current, items: [...current.items, message] };
      });
      markRead(bookingId);
    },
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.thread}>
        {isLoading ? <LoadingState label={t('common.loading')} /> : null}
        {isError ? <ErrorState label={t('bookingMessages.error')} /> : null}
        {!isLoading && !isError && !data?.items.length ? (
          <Text style={styles.hint}>{t('bookingMessages.empty')}</Text>
        ) : null}

        {data?.items.map((item) => {
          const isOwn = item.senderId === session?.user?.id;
          return (
            <View key={item.id} style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
              <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{item.body}</Text>
                <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>{formatTime(item.createdAt)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.composer}>
        <View style={styles.composerInput}>
          <TextField
            label={t('bookingMessages.messageLabel')}
            value={body}
            onChangeText={setBody}
            placeholder={t('bookingMessages.placeholder')}
            multiline
          />
        </View>
        <Button
          label={mutation.isPending ? t('bookingMessages.sending') : t('bookingMessages.send')}
          size="sm"
          disabled={mutation.isPending || !body.trim()}
          onPress={() => mutation.mutate()}
        />
      </View>
      {mutation.isError ? <Text style={styles.error}>{t('bookingMessages.sendFailed')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  thread: { gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.lg },
  hint: { fontSize: fontSize.sm, color: colors.mutedForeground },
  error: { fontSize: fontSize.sm, color: colors.destructive, paddingHorizontal: spacing.md },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  bubbleOwn: { backgroundColor: colors.primary },
  bubbleOther: { backgroundColor: colors.muted },
  bubbleText: { fontSize: fontSize.sm, color: colors.foreground },
  bubbleTextOwn: { color: colors.primaryForeground },
  bubbleTime: { fontSize: 10, color: colors.mutedForeground, marginTop: 2 },
  bubbleTimeOwn: { color: colors.primaryForeground },
  composer: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composerInput: { flex: 1 },
});
