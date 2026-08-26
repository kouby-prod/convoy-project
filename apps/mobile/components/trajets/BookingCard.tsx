import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BookingWithTrajet, BookingStatus } from '@carpool/schemas';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookingMessages } from '@/components/trajets/BookingMessages';
import { ReviewForm } from '@/components/trajets/ReviewForm';
import { colors, spacing, fontSize } from '@/lib/theme';

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'En attente',
  awaiting_payment: 'En attente de paiement',
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
  const canReview = booking.status === 'confirmed' && new Date(booking.trajet.departureDateTime) < new Date();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);

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
      <BookingMessages bookingId={booking.id} />
      {canReview ? (
        reviewed ? (
          <Text style={styles.line}>Merci, votre avis a été envoyé.</Text>
        ) : reviewOpen ? (
          <ReviewForm bookingId={booking.id} onSubmitted={() => setReviewed(true)} />
        ) : (
          <Button label="Laisser un avis sur le conducteur" variant="outline" size="sm" onPress={() => setReviewOpen(true)} />
        )
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  line: { fontSize: fontSize.sm, color: colors.mutedForeground },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
