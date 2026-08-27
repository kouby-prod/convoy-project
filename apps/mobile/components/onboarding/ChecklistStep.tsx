import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, fontSize } from '@/lib/theme';

export function ChecklistStep({
  index,
  title,
  description,
  done,
  locked,
  cta,
  onPress,
  extra,
}: {
  index: number;
  title: string;
  description: string;
  done: boolean;
  locked?: boolean;
  cta?: string;
  onPress?: () => void;
  extra?: ReactNode;
}) {
  return (
    <View style={[styles.row, locked && styles.locked]}>
      <View style={[styles.badge, done && styles.badgeDone]}>
        <Text style={[styles.badgeText, done && styles.badgeTextDone]}>{done ? '✓' : index}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {extra}
        {cta && onPress && !locked ? (
          <Button label={cta} variant={done ? 'outline' : 'primary'} size="sm" onPress={onPress} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  locked: { opacity: 0.6 },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDone: { backgroundColor: colors.secondary + '26' },
  badgeText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  badgeTextDone: { color: colors.secondary },
  body: { flex: 1, gap: spacing.xs },
  title: { fontSize: fontSize.sm, fontWeight: '700', color: colors.foreground },
  description: { fontSize: fontSize.sm, color: colors.mutedForeground },
});
