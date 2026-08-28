import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { Conversation } from '@carpool/schemas';
import { fetchConversations, sortConversations } from '@/lib/conversations';
import { useMessageReadMap } from '@/hooks/useMessageReadMap';
import { isThreadUnread } from '@/lib/message-read';
import { Card } from '@/components/ui/Card';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/StateMessage';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n, type MessageKey } from '@/lib/i18n';

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  pending: 'common.bookingStatus.pending',
  awaiting_payment: 'common.bookingStatus.awaitingPayment',
  confirmed: 'common.bookingStatus.confirmed',
  rejected: 'common.bookingStatus.rejected',
  cancelled: 'common.bookingStatus.cancelled',
  expired: 'common.bookingStatus.expired',
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || '?';
}

function shortWhen(iso: string) {
  const date = new Date(iso);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date)
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

/** Inbox of every booking thread the driver/passenger can access — mobile counterpart of the web's `MessagesInbox`, without the counterpart-grouping trip switcher (kept simple: one row per booking). */
export default function MessagesScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { userId, readMap } = useMessageReadMap();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['messages', 'inbox'],
    queryFn: fetchConversations,
  });

  const conversations = sortConversations(data ?? []);

  return (
    <View style={styles.screen}>
      {isLoading ? <LoadingState label={t('common.loading')} /> : null}
      {isError ? <ErrorState label={t('messagesInbox.error')} /> : null}
      {!isLoading && !isError && !conversations.length ? (
        <EmptyState label={t('messagesInbox.empty')} />
      ) : null}

      {conversations.length ? (
        <FlatList<Conversation>
          data={conversations}
          keyExtractor={(item) => item.bookingId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const unread = isThreadUnread(item, userId, readMap);
            const name = item.counterpart.name || t('common.unknownUser');
            const statusKey = STATUS_LABEL_KEYS[item.bookingStatus];
            const statusLabel = statusKey ? t(statusKey) : item.bookingStatus;
            const roleLabel = item.role === 'driver' ? t('messagesInbox.rolePassenger') : t('messagesInbox.roleDriver');

            return (
              <Pressable onPress={() => router.push(`/messages/${item.bookingId}`)}>
                <Card>
                  <View style={styles.row}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(name)}</Text>
                    </View>
                    <View style={styles.content}>
                      <View style={styles.rowHeader}>
                        <Text style={[styles.name, unread && styles.unreadText]} numberOfLines={1}>
                          {name}
                        </Text>
                        {item.lastMessage ? (
                          <Text style={styles.time}>{shortWhen(item.lastMessage.createdAt)}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.meta} numberOfLines={1}>
                        {roleLabel} · {item.trip.departureCity} → {item.trip.arrivalCity} · {statusLabel}
                      </Text>
                      <Text style={[styles.preview, unread && styles.unreadText]} numberOfLines={1}>
                        {item.lastMessage?.body ?? t('messagesInbox.noMessage')}
                      </Text>
                    </View>
                    {unread ? <View style={styles.dot} /> : null}
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.secondaryForeground },
  content: { flex: 1, minWidth: 0 },
  rowHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.xs },
  name: { fontSize: fontSize.sm, fontWeight: '600', color: colors.foreground, flexShrink: 1 },
  unreadText: { fontWeight: '700' },
  time: { fontSize: fontSize.xs, color: colors.mutedForeground },
  meta: { fontSize: fontSize.xs, color: colors.mutedForeground },
  preview: { fontSize: fontSize.sm, color: colors.foreground },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
