import { StyleSheet, Text, View } from 'react-native';
import type { Trajet, TrajetSearchResult } from '@carpool/schemas';
import { Card } from '@/components/ui/Card';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(
    value,
  );
}

/**
 * Summary card for a trajet — used by both the search results list and "Mes
 * trajets". The rating row only renders when `driverRating`/`driverReviewCount`
 * are present (search results carry them, plain `Trajet` from `/me/trajets`
 * does not).
 */
export function TrajetCard({ trajet }: { trajet: Trajet | TrajetSearchResult }) {
  const withRating = 'driverRating' in trajet ? trajet : null;

  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          {trajet.departureCity} → {trajet.destinationCity}
        </Text>
        {trajet.cancelledAt ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Annulé</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.line}>{formatDateTime(trajet.departureDateTime)}</Text>
      <Text style={styles.line}>
        {trajet.seatsAvailable}/{trajet.seatsTotal} places · {formatPrice(trajet.pricePerSeat)}
      </Text>
      {withRating ? (
        <Text style={styles.line}>
          {withRating.driverRating !== null
            ? `★ ${withRating.driverRating.toFixed(1)} (${withRating.driverReviewCount})`
            : 'Conducteur sans avis'}
          {withRating.distanceKm !== null ? ` · ${withRating.distanceKm.toFixed(1)} km` : ''}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground, flexShrink: 1 },
  line: { fontSize: fontSize.sm, color: colors.mutedForeground },
  badge: {
    backgroundColor: colors.destructive + '1a',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { fontSize: fontSize.xs, color: colors.destructive, fontWeight: '600' },
});
