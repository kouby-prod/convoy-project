import { StyleSheet, Text, View } from 'react-native';
import type { Trajet, TrajetSearchResult } from '@carpool/schemas';
import { Card } from '@/components/ui/Card';
import { AMENITY_LABELS } from '@/lib/amenities';
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
 * trajets". `distanceKm` only renders when present (search results carry it,
 * plain `Trajet` from `/me/trajets` does not).
 */
export function TrajetCard({ trajet }: { trajet: Trajet | TrajetSearchResult }) {
  const distanceKm = 'distanceKm' in trajet ? trajet.distanceKm : null;
  const { driver } = trajet;
  const driverName = [driver.firstName, driver.lastName].filter(Boolean).join(' ') || 'Conducteur';
  const vehicleLine = [driver.carMake, driver.carModel].filter(Boolean).join(' ');

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
      <View style={styles.driverRow}>
        <Text style={styles.line}>
          {driverName}
          {driver.rating !== null ? ` · ★ ${driver.rating.toFixed(1)} (${driver.reviewCount})` : ' · Sans avis'}
          {distanceKm !== null ? ` · ${distanceKm.toFixed(1)} km` : ''}
        </Text>
        {driver.verified ? (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedBadgeText}>Vérifié</Text>
          </View>
        ) : null}
      </View>
      {vehicleLine ? <Text style={styles.line}>{vehicleLine}</Text> : null}
      {trajet.amenities.length > 0 ? (
        <Text style={styles.amenitiesLine} numberOfLines={1}>
          {trajet.amenities.map((amenity) => AMENITY_LABELS[amenity]).join(' · ')}
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
  driverRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  verifiedBadge: {
    backgroundColor: colors.secondary + '26',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  verifiedBadgeText: { fontSize: fontSize.xs, color: colors.secondary, fontWeight: '600' },
  amenitiesLine: { fontSize: fontSize.xs, color: colors.mutedForeground },
});
