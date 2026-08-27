import { Linking, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTrajetLiveLocation } from '@/hooks/useTrajetLiveLocation';
import { colors, spacing, fontSize } from '@/lib/theme';

function formatRelativeTime(value: string): string {
  const diffSec = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (diffSec < 60) return "à l'instant";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHour = Math.round(diffMin / 60);
  return `il y a ${diffHour} h`;
}

/** Passenger-side view: the driver's last known position for this trajet, kept live via WebSocket. */
export function LiveLocationView({ trajetId }: { trajetId: string }) {
  const { location } = useTrajetLiveLocation(trajetId);

  if (!location) {
    return (
      <Card>
        <Text style={styles.cardTitle}>Position en direct</Text>
        <Text style={styles.value}>Le conducteur ne partage pas sa position pour le moment.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>En direct</Text>
        </View>
        <Text style={styles.value}>Mis à jour {formatRelativeTime(location.updatedAt)}</Text>
      </View>
      <Button
        label="Voir sur la carte"
        variant="outline"
        size="sm"
        onPress={() =>
          Linking.openURL(`https://www.google.com/maps?q=${location.lat},${location.lng}`)
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  value: { fontSize: fontSize.sm, color: colors.mutedForeground },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary },
  liveText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.secondary },
});
