import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStripe } from '@stripe/stripe-react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  capturePayPalOrder,
  confirmStripePayment,
  fetchPaymentState,
  isPaidPaymentState,
  startCheckout,
} from '@/lib/payments';
import { formatCad, isPastDue, payableCents } from '@/lib/booking-money';
import { env } from '@/lib/env';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState } from '@/components/ui/StateMessage';
import { colors, spacing, fontSize } from '@/lib/theme';

/** Must match the redirect scheme in apps/api/src/modules/payment/paypal.ts's `application_context`. */
const PAYPAL_REDIRECT_URL = 'carpool://paypal-redirect';

function formatWhen(value: string) {
  return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/**
 * Checkout for one booking's invoice — mobile counterpart of the web's
 * `PaiementCheckout`. Card payment uses Stripe's pre-built `PaymentSheet`
 * (same "let Stripe own the UI" idea as the web's `PaymentElement`). PayPal
 * has no native SDK button here: it opens the approval link (from
 * `POST /payments`'s `approvalUrl`) in an in-app browser and waits for the
 * redirect back to `PAYPAL_REDIRECT_URL`, then captures the order — the
 * mobile equivalent of the web JS SDK's popup-and-postMessage flow.
 */
export default function PaiementScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payingPaypal, setPayingPaypal] = useState(false);

  const queryKey = ['payments', 'by-booking', bookingId] as const;
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => fetchPaymentState(bookingId),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmStripePayment(bookingId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] });
    },
  });

  async function handlePay() {
    if (!data?.invoice) return;
    setPayError(null);
    setPaying(true);
    try {
      const checkout = await startCheckout(bookingId, data.invoice.id, 'stripe');
      if (!checkout.clientSecret) throw new Error('Impossible de préparer le paiement.');

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Kouby',
        paymentIntentClientSecret: checkout.clientSecret,
        returnURL: 'carpool://stripe-redirect',
        defaultBillingDetails: { address: { country: 'CA' } },
      });
      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') setPayError(presentError.message);
        return;
      }

      await confirmMutation.mutateAsync();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Échec du paiement.");
    } finally {
      setPaying(false);
    }
  }

  async function handlePayPal() {
    if (!data?.invoice) return;
    setPayError(null);
    setPayingPaypal(true);
    try {
      const checkout = await startCheckout(bookingId, data.invoice.id, 'paypal');
      if (!checkout.approvalUrl) throw new Error('PayPal est indisponible pour le moment.');

      const result = await WebBrowser.openAuthSessionAsync(checkout.approvalUrl, PAYPAL_REDIRECT_URL);
      if (result.type !== 'success') return; // cancelled or dismissed — not an error
      if (!result.url.includes('result=success')) return; // buyer backed out on PayPal's side

      if (!checkout.orderId) throw new Error('Réponse PayPal invalide.');
      await capturePayPalOrder(checkout.orderId);
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] });
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Échec du paiement PayPal.');
    } finally {
      setPayingPaypal(false);
    }
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <LoadingState label="Chargement…" />
      </ScreenContainer>
    );
  }

  if (isError) {
    return (
      <ScreenContainer>
        <ErrorState label="Impossible de charger le paiement." />
      </ScreenContainer>
    );
  }

  const paid = isPaidPaymentState(data);
  const { booking, invoice, payment } = data ?? {};
  const stripeReady = !!env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const windowClosed = !paid && (invoice?.status === 'voided' || booking?.status === 'expired');
  const overdueOpen = !paid && !windowClosed && invoice?.status === 'issued' && isPastDue(invoice.dueAt);
  const failed = !paid && payment?.status === 'failed';

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        {booking ? (
          <Card>
            <Text style={styles.cardTitle}>
              {booking.trajet.departureCity} → {booking.trajet.destinationCity}
            </Text>
            <Text style={styles.value}>{formatWhen(booking.trajet.departureDateTime)}</Text>
            <Text style={styles.value}>{booking.seats} place(s)</Text>
          </Card>
        ) : null}

        {!invoice ? (
          <Card>
            <Text style={styles.cardTitle}>En attente</Text>
            <Text style={styles.value}>
              {booking?.status === 'pending'
                ? 'En attente de la réponse du conducteur.'
                : 'Aucune facture à régler pour le moment.'}
            </Text>
            {booking ? (
              <Text style={styles.amount}>
                {formatCad(payableCents(null, booking.paymentMethod, booking.fareCents))}
              </Text>
            ) : null}
          </Card>
        ) : paid ? (
          <Card>
            <Text style={styles.cardTitle}>Payé</Text>
            <Text style={styles.value}>Montant réglé : {formatCad(invoice.totalCents)}</Text>
            <Text style={styles.label}>Facture {invoice.number}</Text>
            <View style={styles.row}>
              <Button
                label="Voir les messages"
                variant="outline"
                size="sm"
                onPress={() => router.push(`/messages/${bookingId}`)}
              />
              {booking ? (
                <Button
                  label="Voir le trajet"
                  variant="outline"
                  size="sm"
                  onPress={() => router.push(`/trajets/${booking.trajetId}`)}
                />
              ) : null}
            </View>
          </Card>
        ) : windowClosed ? (
          <Card>
            <Text style={styles.cardTitle}>Fenêtre de paiement expirée</Text>
            <Text style={styles.value}>Cette réservation n'est plus payable.</Text>
          </Card>
        ) : (
          <Card>
            <Text style={styles.cardTitle}>Paiement</Text>
            {overdueOpen ? <Text style={styles.error}>Le paiement est en retard.</Text> : null}
            {failed ? <Text style={styles.error}>Le dernier paiement a échoué. Réessayez.</Text> : null}
            <Text style={styles.amount}>{formatCad(invoice.totalCents)}</Text>
            <Text style={styles.label}>
              Commission {formatCad(invoice.commissionCents)}
              {invoice.taxLines.length
                ? ' + ' + invoice.taxLines.map((l) => `${l.label} ${formatCad(l.amountCents)}`).join(' + ')
                : ''}
            </Text>

            {payError ? <Text style={styles.error}>{payError}</Text> : null}

            {stripeReady ? (
              <Button
                label={paying ? 'Traitement…' : `Payer par carte ${formatCad(invoice.totalCents)}`}
                onPress={() => void handlePay()}
                disabled={paying || payingPaypal}
                loading={paying}
              />
            ) : (
              <Text style={styles.error}>
                Le paiement par carte n'est pas disponible sur cette build.
              </Text>
            )}

            <Button
              label={payingPaypal ? 'Redirection…' : 'Payer avec PayPal'}
              variant="outline"
              onPress={() => void handlePayPal()}
              disabled={paying || payingPaypal}
              loading={payingPaypal}
            />

            <Button
              label="Ouvrir le paiement sur le web"
              variant="outline"
              size="sm"
              onPress={() => Linking.openURL(`${env.EXPO_PUBLIC_WEB_URL}/paiement/${bookingId}`)}
            />
          </Card>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  label: { fontSize: fontSize.xs, color: colors.mutedForeground },
  value: { fontSize: fontSize.sm, color: colors.foreground },
  amount: { fontSize: fontSize.xl, fontWeight: '800', color: colors.foreground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  row: { flexDirection: 'row', gap: spacing.sm },
});
