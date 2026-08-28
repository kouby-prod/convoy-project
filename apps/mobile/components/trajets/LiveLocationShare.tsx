import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLiveLocationShare } from '@/hooks/useLiveLocationShare';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n, type MessageKey } from '@/lib/i18n';

const ERROR_LABEL_KEYS: Record<'unsupported' | 'permission-denied' | 'send-failed', MessageKey> = {
  unsupported: 'liveLocationShare.unsupported',
  'permission-denied': 'liveLocationShare.permissionDenied',
  'send-failed': 'liveLocationShare.sendFailed',
};

/** Driver-side control: start/stop live position sharing for this trajet. */
export function LiveLocationShare({ trajetId, cancelled }: { trajetId: string; cancelled: boolean }) {
  const { t } = useI18n();
  const { status, error, start, stop, isSharing } = useLiveLocationShare(trajetId);

  if (cancelled) return null;

  return (
    <Card>
      <Text style={styles.cardTitle}>{t('liveLocationShare.title')}</Text>
      <Text style={styles.value}>{t('liveLocationShare.description')}</Text>

      {error ? <Text style={styles.error}>{t(ERROR_LABEL_KEYS[error])}</Text> : null}

      <View style={styles.row}>
        {isSharing ? (
          <Button label={t('liveLocationShare.stopSharing')} variant="outline" size="sm" onPress={stop} />
        ) : (
          <Button
            label={status === 'requesting' ? t('liveLocationShare.starting') : t('liveLocationShare.startSharing')}
            variant="primary"
            size="sm"
            disabled={status === 'requesting'}
            onPress={() => void start()}
          />
        )}
        {isSharing ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t('liveLocationShare.live')}</Text>
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
