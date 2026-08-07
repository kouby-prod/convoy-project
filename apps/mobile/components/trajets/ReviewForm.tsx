import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const RATING_VALUES = [5, 4, 3, 2, 1];

/**
 * Inline 1-5 rating + optional comment form for one booking — mobile
 * counterpart of the web's `ReviewForm` (passenger→driver, in
 * mes-reservations-list.tsx) and `RatePassengerForm` (driver→passenger, in
 * trajet-bookings.tsx). Both are the same `POST /reviews` call with the same
 * payload shape — the server derives the direction from the caller's
 * identity — so mobile uses a single shared component for both contexts
 * instead of duplicating it.
 */
export function ReviewForm({ bookingId, onSubmitted }: { bookingId: string; onSubmitted: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.reviews.$post({
        json: { bookingId, rating, comment: comment.trim() || undefined },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Échec de l'envoi de l'avis.");
      }
      return res.json();
    },
    onSuccess: () => onSubmitted(),
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Note</Text>
      <View style={styles.ratingRow}>
        {RATING_VALUES.map((value) => (
          <Button
            key={value}
            label={String(value)}
            size="sm"
            variant={rating === value ? 'primary' : 'outline'}
            onPress={() => setRating(value)}
          />
        ))}
      </View>
      <TextField
        label="Commentaire (optionnel)"
        value={comment}
        onChangeText={setComment}
        multiline
        numberOfLines={3}
      />
      {mutation.isError ? <Text style={styles.error}>{(mutation.error as Error).message}</Text> : null}
      <Button
        label={mutation.isPending ? 'Envoi…' : "Envoyer l'avis"}
        size="sm"
        disabled={mutation.isPending}
        onPress={() => mutation.mutate()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.foreground },
  ratingRow: { flexDirection: 'row', gap: spacing.xs },
  error: { fontSize: fontSize.sm, color: colors.destructive },
});
