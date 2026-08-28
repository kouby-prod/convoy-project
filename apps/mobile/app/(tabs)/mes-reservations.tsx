import { useState } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingWithTrajet } from '@carpool/schemas';
import { api } from '@/lib/api-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/StateMessage';
import { BookingCard } from '@/components/trajets/BookingCard';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

/** Passenger's own bookings (`GET /me/bookings`), with cancel for pending/confirmed ones. */
export default function MesReservationsScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'bookings', page],
    queryFn: async () => {
      const res = await api.me.bookings.$get({ query: { page: String(page) } });
      if (!res.ok) throw new Error('Failed to load bookings');
      return res.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ trajetId, bookingId }: { trajetId: string; bookingId: string }) => {
      const res = await api.trajets[':id'].bookings[':bookingId'].cancel.$post({
        param: { id: trajetId, bookingId },
      });
      if (!res.ok) throw new Error('Failed to cancel booking');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] });
    },
  });

  return (
    <ScreenContainer>
      {isLoading ? <LoadingState label={t('common.loading')} /> : null}
      {isError ? <ErrorState label={t('mesReservations.error')} /> : null}
      {!isLoading && !isError && !data?.items.length ? <EmptyState label={t('mesReservations.empty')} /> : null}

      {data?.items.length ? (
        <FlatList<BookingWithTrajet>
          data={data.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
              cancelling={cancelMutation.isPending && cancelMutation.variables?.bookingId === item.id}
              onCancel={() => cancelMutation.mutate({ trajetId: item.trajetId, bookingId: item.id })}
            />
          )}
          ListFooterComponent={
            <>
              {cancelMutation.isError ? <Text style={styles.error}>{t('mesReservations.cancelFailed')}</Text> : null}
              <PaginationBar
                page={page}
                hasMore={data.hasMore}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            </>
          }
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl },
  error: { fontSize: fontSize.sm, color: colors.destructive, paddingTop: spacing.sm },
});
