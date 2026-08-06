import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, fontSize } from '@/lib/theme';

/** Centered loading/error/empty messages, reused across every list screen. */
export function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

export function ErrorState({ label }: { label: string }) {
  return (
    <View style={styles.container}>
      <Text style={[styles.text, styles.errorText]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  text: { fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: 'center' },
  errorText: { color: colors.destructive },
});
