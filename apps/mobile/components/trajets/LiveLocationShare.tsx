import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLiveLocationShare } from '@/hooks/useLiveLocationShare';
import { colors, spacing, fontSize } from '@/lib/theme';

const ERROR_LABELS = {
  unsupported: "La géolocalisation n'est pas disponible sur cet appareil.",
  'permission-denied': "Autorisez l'accès à votre position pour partager votre trajet.",
  'send-failed': "Échec de l'envoi de votre position.",
} as const;

/** Driver-side control: start/stop live position sharing for this trajet. */
export function LiveLocationShare({ trajetId, cancelled }: { trajetId: string; cancelled: boolean }) {
  const { status, error, start, stop, isSharing } = useLiveLocationShare(trajetId);

  if (cancelled) return null;

  return (
    <Card>
      <Text style={styles.cardTitle}>Position en direct</Text>
      <Text style={styles.value}>Partagez votre position pendant le trajet pour rassurer vos passagers.</Text>

      {error ? <Text style={styles.error}>{ERROR_LABELS[error]}</Text> : null}

      <View style={styles.row}>
        {isSharing ? (
          <Button label="Arrêter le partage" variant="outline" size="sm" onPress={stop} />
        ) : (
          <Button
            label={status === 'requesting' ? 'Démarrage…' : 'Partager ma position'}
            variant="primary"
            size="sm"
            disabled={status === 'requesting'}
            onPress={() => void start()}
          />
        )}
        {isSharing ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>En direct</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  value: { fontSize: fontSize.sm, color: colors.mutedForeground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary },
  liveText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.secondary },
});
