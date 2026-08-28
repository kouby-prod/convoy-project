import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { BookingWithTrajet, BookingStatus } from '@carpool/schemas';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookingMessages } from '@/components/trajets/BookingMessages';
import { ReviewForm } from '@/components/trajets/ReviewForm';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n, type MessageKey } from '@/lib/i18n';

const STATUS_LABEL_KEYS: Record<BookingStatus, MessageKey> = {
  pending: 'common.bookingStatus.pending',
  awaiting_payment: 'common.bookingStatus.awaitingPayment',
  confirmed: 'common.bookingStatus.confirmed',
  rejected: 'common.bookingStatus.rejected',
  cancelled: 'common.bookingStatus.cancelled',
  expired: 'common.bookingStatus.expired',
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
  const { t } = useI18n();
  const router = useRouter();
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
      <Text style={styles.line}>{t('common.seatsCount', { count: booking.seats })}</Text>
      <View style={styles.statusRow}>
        <Text style={styles.line}>{t('bookingCard.statusLabel', { status: t(STATUS_LABEL_KEYS[booking.status]) })}</Text>
        {canCancel ? (
          <Button
            label={cancelling ? t('bookingCard.cancelling') : t('bookingCard.cancel')}
            variant="outline"
            size="sm"
            disabled={cancelling}
            onPress={onCancel}
          />
        ) : null}
      </View>
      {booking.status === 'awaiting_payment' ? (
        <Button label={t('bookingCard.payNow')} size="sm" onPress={() => router.push(`/paiement/${booking.id}`)} />
      ) : null}
      <BookingMessages bookingId={booking.id} />
      {canReview ? (
        reviewed ? (
          <Text style={styles.line}>{t('bookingCard.reviewSent')}</Text>
        ) : reviewOpen ? (
          <ReviewForm bookingId={booking.id} onSubmitted={() => setReviewed(true)} />
        ) : (
          <Button
            label={t('bookingCard.leaveReview')}
            variant="outline"
            size="sm"
            onPress={() => setReviewOpen(true)}
          />
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
