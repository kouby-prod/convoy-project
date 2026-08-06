import { StyleSheet, Text, View } from 'react-native';
import type { BookingWithTrajet, BookingStatus } from '@carpool/schemas';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, spacing, fontSize } from '@/lib/theme';

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
  expired: 'Expirée',
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function BookingCard({
  booking,
  onCancel,
  cancelling,
}: {
  booking: BookingWithTrajet;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const canCancel = booking.status === 'pending' || booking.status === 'confirmed';

  return (
    <Card>
      <Text style={styles.title}>
        {booking.trajet.departureCity} → {booking.trajet.destinationCity}
      </Text>
      <Text style={styles.line}>{formatDateTime(booking.trajet.departureDateTime)}</Text>
      <Text style={styles.line}>{booking.seats} place(s)</Text>
      <View style={styles.statusRow}>
        <Text style={styles.line}>Statut : {STATUS_LABELS[booking.status]}</Text>
        {canCancel ? (
          <Button label={cancelling ? 'Annulation…' : 'Annuler'} variant="outline" size="sm" disabled={cancelling} onPress={onCancel} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  line: { fontSize: fontSize.sm, color: colors.mutedForeground },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
