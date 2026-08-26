import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification, NotificationType } from '@carpool/schemas';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/notifications';
import { useNotificationsSocket } from '@/hooks/useNotificationsSocket';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/StateMessage';
import { colors, spacing, fontSize } from '@/lib/theme';

const TYPE_LABELS: Record<NotificationType, string> = {
  booking_request: 'Demande de réservation',
  booking_status: 'Mise à jour de réservation',
  trip_cancelled: 'Trajet annulé',
  message: 'Message',
  system: 'Système',
};

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  return rtf.format(diffDay, 'day');
}

/** Extracts `/trajets/:id` from a notification's web link, if that's what it points to — the only in-app destination mobile knows how to open. */
function trajetIdFromLink(link: string | null): string | null {
  if (!link) return null;
  const match = /\/trajets\/([^/?#]+)/.exec(link);
  return match?.[1] ?? null;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications', 'list', unreadOnly, page],
    queryFn: () => fetchNotifications(page, unreadOnly),
  });

  useNotificationsSocket({
    onNotification: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  function openNotification(notification: Notification) {
    if (!notification.readAt) markReadMutation.mutate(notification.id);
    const trajetId = trajetIdFromLink(notification.link);
    if (trajetId) router.push(`/trajets/${trajetId}`);
  }

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.tabs}>
          <Button
            label="Toutes"
            size="sm"
            variant={!unreadOnly ? 'primary' : 'outline'}
            onPress={() => {
              setUnreadOnly(false);
              setPage(1);
            }}
          />
          <Button
            label={unreadCount > 0 ? `Non lues (${unreadCount})` : 'Non lues'}
            size="sm"
            variant={unreadOnly ? 'primary' : 'outline'}
            onPress={() => {
              setUnreadOnly(true);
              setPage(1);
            }}
          />
        </View>
        {unreadCount > 0 ? (
          <Button
            label={markAllReadMutation.isPending ? 'Marquage…' : 'Tout marquer comme lu'}
            size="sm"
            variant="outline"
            disabled={markAllReadMutation.isPending}
            onPress={() => markAllReadMutation.mutate()}
          />
        ) : null}
      </View>

      {isLoading ? <LoadingState label="Chargement…" /> : null}
      {isError ? <ErrorState label="Impossible de charger les notifications." /> : null}
      {!isLoading && !isError && !data?.items.length ? (
        <EmptyState label={unreadOnly ? 'Aucune notification non lue.' : 'Aucune notification pour le moment.'} />
      ) : null}

      {data?.items.length ? (
        <FlatList<Notification>
          data={data.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const unread = !item.readAt;
            return (
              <Pressable onPress={() => openNotification(item)}>
                <Card style={unread ? styles.unreadCard : undefined}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.type}>{TYPE_LABELS[item.type]}</Text>
                    {unread ? <View style={styles.dot} /> : null}
                  </View>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.body} numberOfLines={2}>
                    {item.body}
                  </Text>
                  <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
                </Card>
              </Pressable>
            );
          }}
          ListFooterComponent={
            <PaginationBar
              page={page}
              hasMore={data.hasMore}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          }
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, paddingBottom: spacing.md },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  unreadCard: { borderColor: colors.primary },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  type: { fontSize: fontSize.xs, color: colors.mutedForeground, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  title: { fontSize: fontSize.sm, fontWeight: '700', color: colors.foreground },
  body: { fontSize: fontSize.sm, color: colors.mutedForeground },
  time: { fontSize: fontSize.xs, color: colors.mutedForeground },
});
