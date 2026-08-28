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
import { useI18n } from '@/lib/i18n';

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
  const { t, locale } = useI18n();
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
      if (!checkout.clientSecret) throw new Error(t('paiement.prepareFailed'));

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
      setPayError(err instanceof Error ? err.message : t('paiement.genericError'));
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
      if (!checkout.approvalUrl) throw new Error(t('paiement.paypalUnavailable'));

      const result = await WebBrowser.openAuthSessionAsync(checkout.approvalUrl, PAYPAL_REDIRECT_URL);
      if (result.type !== 'success') return; // cancelled or dismissed — not an error
      if (!result.url.includes('result=success')) return; // buyer backed out on PayPal's side

      if (!checkout.orderId) throw new Error(t('paiement.paypalInvalidResponse'));
      await capturePayPalOrder(checkout.orderId);
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] });
    } catch (err) {
      setPayError(err instanceof Error ? err.message : t('paiement.paypalFailed'));
    } finally {
      setPayingPaypal(false);
    }
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <LoadingState label={t('paiement.loading')} />
      </ScreenContainer>
    );
  }

  if (isError) {
    return (
      <ScreenContainer>
        <ErrorState label={t('paiement.error')} />
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
            <Text style={styles.value}>{t('common.seatsCount', { count: booking.seats })}</Text>
          </Card>
        ) : null}

        {!invoice ? (
          <Card>
            <Text style={styles.cardTitle}>{t('paiement.waitingTitle')}</Text>
            <Text style={styles.value}>
              {booking?.status === 'pending' ? t('paiement.waitingDriver') : t('paiement.waitingNoInvoice')}
            </Text>
            {booking ? (
              <Text style={styles.amount}>
                {formatCad(payableCents(null, booking.paymentMethod, booking.fareCents), locale)}
              </Text>
            ) : null}
          </Card>
        ) : paid ? (
          <Card>
            <Text style={styles.cardTitle}>{t('paiement.paidTitle')}</Text>
            <Text style={styles.value}>{t('paiement.paidAmount', { amount: formatCad(invoice.totalCents, locale) })}</Text>
            <Text style={styles.label}>{t('paiement.invoiceNumber', { number: invoice.number })}</Text>
            <View style={styles.row}>
              <Button
                label={t('paiement.viewMessages')}
                variant="outline"
                size="sm"
                onPress={() => router.push(`/messages/${bookingId}`)}
              />
              {booking ? (
                <Button
                  label={t('paiement.viewTrip')}
                  variant="outline"
                  size="sm"
                  onPress={() => router.push(`/trajets/${booking.trajetId}`)}
                />
              ) : null}
            </View>
          </Card>
        ) : windowClosed ? (
          <Card>
            <Text style={styles.cardTitle}>{t('paiement.closedTitle')}</Text>
            <Text style={styles.value}>{t('paiement.closedBody')}</Text>
          </Card>
        ) : (
          <Card>
            <Text style={styles.cardTitle}>{t('paiement.paymentTitle')}</Text>
            {overdueOpen ? <Text style={styles.error}>{t('paiement.overdue')}</Text> : null}
            {failed ? <Text style={styles.error}>{t('paiement.failed')}</Text> : null}
            <Text style={styles.amount}>{formatCad(invoice.totalCents, locale)}</Text>
            <Text style={styles.label}>
              {t('paiement.commission', { amount: formatCad(invoice.commissionCents, locale) })}
              {invoice.taxLines.length
                ? ' + ' + invoice.taxLines.map((l) => `${l.label} ${formatCad(l.amountCents, locale)}`).join(' + ')
                : ''}
            </Text>

            {payError ? <Text style={styles.error}>{payError}</Text> : null}

            {stripeReady ? (
              <Button
                label={paying ? t('paiement.processing') : t('paiement.payByCard', { amount: formatCad(invoice.totalCents, locale) })}
                onPress={() => void handlePay()}
                disabled={paying || payingPaypal}
                loading={paying}
              />
            ) : (
              <Text style={styles.error}>{t('paiement.cardUnavailable')}</Text>
            )}

            <Button
              label={payingPaypal ? t('paiement.redirecting') : t('paiement.payWithPaypal')}
              variant="outline"
              onPress={() => void handlePayPal()}
              disabled={paying || payingPaypal}
              loading={payingPaypal}
            />

            <Button
              label={t('paiement.openOnWeb')}
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
