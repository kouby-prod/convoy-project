import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { StopPolicy, Trajet, TrajetAmenity, TrajetSearchResult } from '@carpool/schemas';
import { api } from '@/lib/api-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/StateMessage';
import { TrajetCard } from '@/components/trajets/TrajetCard';
import { AMENITY_LABELS, AMENITY_ORDER } from '@/lib/amenities';
import { colors, spacing, fontSize } from '@/lib/theme';

interface Filters {
  departureCity: string;
  destinationCity: string;
  date: string;
  minSeats: string;
  maxPrice: string;
  minDriverRating: string;
  amenities: TrajetAmenity[];
  stopPolicy: StopPolicy;
}

const EMPTY_FILTERS: Filters = {
  departureCity: '',
  destinationCity: '',
  date: '',
  minSeats: '',
  maxPrice: '',
  minDriverRating: '',
  amenities: [],
  stopPolicy: 'any',
};

const STOP_POLICY_OPTIONS: { value: StopPolicy; label: string }[] = [
  { value: 'any', label: 'Peu importe' },
  { value: 'direct', label: 'Sans arrêt' },
  { value: 'withStops', label: 'Avec arrêt' },
];

function toQuery(filters: Filters): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  if (filters.departureCity) query.departureCity = filters.departureCity;
  if (filters.destinationCity) query.destinationCity = filters.destinationCity;
  if (filters.date) query.date = filters.date;
  if (filters.minSeats) query.minSeats = filters.minSeats;
  if (filters.maxPrice) query.maxPrice = filters.maxPrice;
  if (filters.minDriverRating) query.minDriverRating = filters.minDriverRating;
  if (filters.amenities.length > 0) query.amenities = filters.amenities;
  if (filters.stopPolicy !== 'any') query.stopPolicy = filters.stopPolicy;
  return query;
}

export default function RechercheScreen() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedQuery, setAppliedQuery] = useState<Record<string, string | string[]>>({});
  const [page, setPage] = useState(1);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAmenity(amenity: TrajetAmenity) {
    setFilters((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  }

  function applyFilters() {
    setAppliedQuery(toQuery(filters));
    setPage(1);
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trajets', appliedQuery, page],
    queryFn: async () => {
      const res = await api.trajets.$get({ query: { ...appliedQuery, page: String(page) } });
      if (!res.ok) throw new Error('Failed to load trajets');
      return res.json();
    },
  });

  return (
    <ScreenContainer>
      <View style={styles.form}>
        <TextField
          label="Ville de départ"
          value={filters.departureCity}
          onChangeText={(v) => updateFilter('departureCity', v)}
        />
        <TextField
          label="Ville d'arrivée"
          value={filters.destinationCity}
          onChangeText={(v) => updateFilter('destinationCity', v)}
        />
        <TextField
          label="Date (AAAA-MM-JJ)"
          value={filters.date}
          onChangeText={(v) => updateFilter('date', v)}
          placeholder="2026-08-15"
        />
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <TextField
              label="Places min."
              value={filters.minSeats}
              onChangeText={(v) => updateFilter('minSeats', v)}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.rowItem}>
            <TextField
              label="Prix max."
              value={filters.maxPrice}
              onChangeText={(v) => updateFilter('maxPrice', v)}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <TextField
          label="Note min. du conducteur (1-5)"
          value={filters.minDriverRating}
          onChangeText={(v) => updateFilter('minDriverRating', v)}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Arrêts</Text>
        <View style={styles.row}>
          {STOP_POLICY_OPTIONS.map((option) => (
            <Button
              key={option.value}
              label={option.label}
              size="sm"
              variant={filters.stopPolicy === option.value ? 'primary' : 'outline'}
              onPress={() => updateFilter('stopPolicy', option.value)}
            />
          ))}
        </View>

        <Text style={styles.label}>Options du trajet</Text>
        <View style={styles.amenitiesGrid}>
          {AMENITY_ORDER.map((amenity) => (
            <Button
              key={amenity}
              label={AMENITY_LABELS[amenity]}
              size="sm"
              variant={filters.amenities.includes(amenity) ? 'primary' : 'outline'}
              onPress={() => toggleAmenity(amenity)}
            />
          ))}
        </View>

        <Button label="Rechercher" onPress={applyFilters} />
      </View>

      {isLoading ? <LoadingState label="Chargement des trajets…" /> : null}
      {isError ? <ErrorState label="Impossible de charger les trajets." /> : null}
      {!isLoading && !isError && !data?.items.length ? (
        <EmptyState label="Aucun trajet ne correspond à ces critères." />
      ) : null}

      {data?.items.length ? (
        <FlatList<TrajetSearchResult | Trajet>
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
  form: { gap: spacing.sm, paddingBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  rowItem: { flex: 1 },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.foreground },
  amenitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  list: { gap: spacing.md, paddingBottom: spacing.xl },
});
