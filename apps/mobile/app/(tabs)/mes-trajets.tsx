import { useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/StateMessage';
import { TrajetCard } from '@/components/trajets/TrajetCard';
import { spacing } from '@/lib/theme';

/** Driver's own trajets (`GET /me/trajets`), read-only this pass — no publish/edit from mobile yet. */
export default function MesTrajetsScreen() {
  const router = useRouter();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'trajets', page],
    queryFn: async () => {
      const res = await api.me.trajets.$get({ query: { page: String(page) } });
      if (!res.ok) throw new Error('Failed to load trajets');
      return res.json();
    },
  });

  return (
    <ScreenContainer>
      {isLoading ? <LoadingState label="Chargement…" /> : null}
      {isError ? <ErrorState label="Impossible de charger vos trajets." /> : null}
      {!isLoading && !isError && !data?.items.length ? (
        <EmptyState label="Vous n'avez publié aucun trajet." />
      ) : null}

      {data?.items.length ? (
        <FlatList
          data={data.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/trajets/${item.id}`)}>
              <TrajetCard trajet={item} />
            </Pressable>
          )}
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
  list: { gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl },
});
