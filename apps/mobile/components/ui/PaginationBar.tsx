import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { colors, spacing, fontSize } from '@/lib/theme';

export interface PaginationBarProps {
  page: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/** Prev/Next pager shared by every paginated list — mirrors the web's page-state pattern (no infinite scroll). */
export function PaginationBar({ page, hasMore, onPrev, onNext }: PaginationBarProps) {
  return (
    <View style={styles.row}>
      <Button label="Précédent" variant="outline" size="sm" disabled={page <= 1} onPress={onPrev} />
      <Text style={styles.pageLabel}>Page {page}</Text>
      <Button label="Suivant" variant="outline" size="sm" disabled={!hasMore} onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  pageLabel: { fontSize: fontSize.xs, color: colors.mutedForeground },
});
