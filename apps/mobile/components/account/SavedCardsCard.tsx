import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStripe } from '@stripe/stripe-react-native';
import {
  createSetupIntent,
  fetchSavedPaymentMethods,
  removePaymentMethod,
  setDefaultPaymentMethod,
} from '@/lib/payment-methods';
import { env } from '@/lib/env';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, spacing, fontSize } from '@/lib/theme';

const METHODS_KEY = ['payment-methods'] as const;

/**
 * Saved Stripe cards — mobile counterpart of the web's `SavedCardsForm`.
 * Adding a card uses the `PaymentSheet` in "setup" mode
 * (`setupIntentClientSecret` instead of `paymentIntentClientSecret`) — same
 * pre-built-UI approach as the booking checkout in app/paiement/[bookingId].
 */
export function SavedCardsCard() {
  const queryClient = useQueryClient();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const stripeReady = !!env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const query = useQuery({
    queryKey: METHODS_KEY,
    queryFn: fetchSavedPaymentMethods,
    enabled: stripeReady,
  });

  const removeMutation = useMutation({
    mutationFn: removePaymentMethod,
    onSuccess: (data) => queryClient.setQueryData(METHODS_KEY, data),
  });

  const defaultMutation = useMutation({
    mutationFn: setDefaultPaymentMethod,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: METHODS_KEY }),
  });

  async function handleAddCard() {
    setAddError(null);
    setAdding(true);
    try {
      const setup = await createSetupIntent();
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Kouby',
        setupIntentClientSecret: setup.clientSecret,
        returnURL: 'carpool://stripe-redirect',
        defaultBillingDetails: { address: { country: 'CA' } },
      });
      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') setAddError(presentError.message);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: METHODS_KEY });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Échec de l'ajout de la carte.");
    } finally {
      setAdding(false);
    }
  }

  if (!stripeReady) return null;
  if (query.data && query.data.configured === false) return null;

  const items = query.data?.items ?? [];

  return (
    <Card>
      <Text style={styles.cardTitle}>Cartes enregistrées</Text>

      {query.isLoading ? <Text style={styles.value}>Chargement…</Text> : null}
      {query.isError ? <Text style={styles.error}>Impossible de charger vos cartes.</Text> : null}
      {!query.isLoading && !items.length ? <Text style={styles.value}>Aucune carte enregistrée.</Text> : null}

      {items.map((card) => (
        <View key={card.id} style={styles.row}>
          <View>
            <Text style={styles.value}>
              {card.brand} ···· {card.last4}
              {card.isDefault ? <Text style={styles.badge}>  Par défaut</Text> : null}
            </Text>
            <Text style={styles.label}>
              Expire {String(card.expMonth).padStart(2, '0')}/{card.expYear}
            </Text>
          </View>
          <View style={styles.actions}>
            {!card.isDefault ? (
              <Button
                label="Définir par défaut"
                variant="outline"
                size="sm"
                disabled={defaultMutation.isPending}
                onPress={() => defaultMutation.mutate(card.id)}
              />
            ) : null}
            <Button
              label="Retirer"
              variant="destructive"
              size="sm"
              disabled={removeMutation.isPending}
              onPress={() => removeMutation.mutate(card.id)}
            />
          </View>
        </View>
      ))}

      {removeMutation.isError || defaultMutation.isError ? (
        <Text style={styles.error}>Une action sur les cartes a échoué.</Text>
      ) : null}
      {addError ? <Text style={styles.error}>{addError}</Text> : null}

      <Button
        label={adding ? 'Ajout…' : 'Ajouter une carte'}
        variant="outline"
        disabled={adding}
        onPress={() => void handleAddCard()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.xs },
  label: { fontSize: fontSize.xs, color: colors.mutedForeground },
  value: { fontSize: fontSize.sm, color: colors.foreground },
  badge: { fontSize: fontSize.xs, fontWeight: '600', color: colors.mutedForeground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
});
