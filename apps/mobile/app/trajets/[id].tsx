import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RidePaymentMethod, Trajet } from '@carpool/schemas';
import { api } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState } from '@/components/ui/StateMessage';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { BookingMessages } from '@/components/trajets/BookingMessages';
import { ReviewForm } from '@/components/trajets/ReviewForm';
import { LiveLocationShare } from '@/components/trajets/LiveLocationShare';
import { LiveLocationView } from '@/components/trajets/LiveLocationView';
import { AMENITY_LABELS } from '@/lib/amenities';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  awaiting_payment: 'En attente de paiement',
  confirmed: 'Confirmée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
  expired: 'Expirée',
};

const PAYMENT_METHOD_LABELS: Record<RidePaymentMethod, string> = {
  card: 'Carte',
  interac: 'Interac',
  cash: 'Comptant',
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(value));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(
    value,
  );
}

/** Driver trust strip — built entirely from the trajet's embedded `driver` profile, no extra fetch. */
function DriverProfile({ driver }: { driver: Trajet['driver'] }) {
  const name = [driver.firstName, driver.lastName].filter(Boolean).join(' ') || '—';
  const vehicleLine = [driver.carMake, driver.carModel].filter(Boolean).join(' ');

  return (
    <Card>
      <View style={styles.driverHeaderRow}>
        <Text style={styles.cardTitle}>{name}</Text>
        <View style={driver.verified ? styles.verifiedBadge : styles.unverifiedBadge}>
          <Text style={driver.verified ? styles.verifiedBadgeText : styles.unverifiedBadgeText}>
            {driver.verified ? 'Vérifié' : 'Non vérifié'}
          </Text>
        </View>
      </View>
      <Text style={styles.value}>
        {driver.rating !== null ? `★ ${driver.rating.toFixed(1)} (${driver.reviewCount ?? 0} avis)` : 'Aucun avis'}
      </Text>
      {vehicleLine ? <Text style={styles.value}>{vehicleLine}</Text> : null}
      {driver.carSeats !== null ? <Text style={styles.value}>{driver.carSeats} places dans le véhicule</Text> : null}
    </Card>
  );
}

/**
 * Driver-only cancel control for a published trajet — the mobile counterpart
 * of `apps/web/src/components/trajets/trajet-owner-actions.tsx`'s cancel
 * half. Editing (`PATCH /trajets/:id`) is not ported to mobile this pass;
 * only cancellation (`DELETE /trajets/:id`, a soft delete that cascades to
 * active bookings).
 */
function OwnerActions({ trajetId, cancelled }: { trajetId: string; cancelled: boolean }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const cancelTrajetMutation = useMutation({
    mutationFn: async () => {
      const res = await api.trajets[':id'].$delete({ param: { id: trajetId } });
      if (!res.ok) throw new Error('Failed to cancel trajet');
      return res.json();
    },
    onSuccess: () => {
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
      queryClient.invalidateQueries({ queryKey: ['me', 'trajets'] });
    },
  });

  if (cancelled) return null;

  return (
    <Card>
      <Text style={styles.cardTitle}>Gestion du trajet</Text>
      {confirming ? (
        <>
          <Text style={styles.value}>Confirmer l'annulation de ce trajet ?</Text>
          <View style={styles.row}>
            <Button
              label={cancelTrajetMutation.isPending ? 'Annulation…' : 'Oui, annuler'}
              variant="destructive"
              size="sm"
              disabled={cancelTrajetMutation.isPending}
              onPress={() => cancelTrajetMutation.mutate()}
            />
            <Button label="Retour" variant="outline" size="sm" onPress={() => setConfirming(false)} />
          </View>
        </>
      ) : (
        <Button label="Annuler ce trajet" variant="outline" size="sm" onPress={() => setConfirming(true)} />
      )}
      {cancelTrajetMutation.isError ? <Text style={styles.error}>Échec de l'annulation.</Text> : null}
    </Card>
  );
}

/**
 * Driver-only booking requests for a trajet — the mobile counterpart of
 * `apps/web/src/components/trajets/trajet-bookings.tsx`.
 */
function TrajetBookingsList({ trajetId, departureDateTime }: { trajetId: string; departureDateTime: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const hasDeparted = new Date(departureDateTime) < new Date();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trajets', trajetId, 'bookings', page],
    queryFn: async () => {
      const res = await api.trajets[':id'].bookings.$get({
        param: { id: trajetId },
        query: { page: String(page) },
      });
      if (!res.ok) throw new Error('Failed to load bookings');
      return res.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: 'confirmed' | 'rejected' }) => {
      const res = await api.trajets[':id'].bookings[':bookingId'].$patch({
        param: { id: trajetId, bookingId },
        json: { status },
      });
      if (!res.ok) throw new Error('Failed to update booking');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
    },
  });

  return (
    <Card>
      <Text style={styles.cardTitle}>Réservations reçues</Text>
      {isLoading ? <LoadingState label="Chargement…" /> : null}
      {isError ? <ErrorState label="Impossible de charger les réservations." /> : null}
      {!isLoading && !isError && !data?.items.length ? (
        <Text style={styles.value}>Aucune réservation pour ce trajet.</Text>
      ) : null}

      {data?.items.map((booking) => (
        <View key={booking.id} style={styles.bookingItem}>
          <View style={styles.bookingRow}>
            <View>
              <Text style={styles.value}>{booking.seats} place(s)</Text>
              <Text style={styles.label}>{STATUS_LABELS[booking.status] ?? booking.status}</Text>
            </View>
            {booking.status === 'pending' ? (
              <View style={styles.row}>
                <Button
                  label="Accepter"
                  size="sm"
                  disabled={statusMutation.isPending}
                  onPress={() => statusMutation.mutate({ bookingId: booking.id, status: 'confirmed' })}
                />
                <Button
                  label="Refuser"
                  size="sm"
                  variant="outline"
                  disabled={statusMutation.isPending}
                  onPress={() => statusMutation.mutate({ bookingId: booking.id, status: 'rejected' })}
                />
              </View>
            ) : null}
          </View>
          <BookingMessages bookingId={booking.id} />
          {booking.status === 'confirmed' && hasDeparted ? (
            reviewedIds.has(booking.id) ? (
              <Text style={styles.value}>Avis envoyé pour ce passager.</Text>
            ) : openReviewId === booking.id ? (
              <ReviewForm
                bookingId={booking.id}
                onSubmitted={() => {
                  setReviewedIds((prev) => new Set(prev).add(booking.id));
                  setOpenReviewId(null);
                }}
              />
            ) : (
              <Button
                label="Noter ce passager"
                variant="outline"
                size="sm"
                onPress={() => setOpenReviewId(booking.id)}
              />
            )
          ) : null}
        </View>
      ))}

      {statusMutation.isError ? <Text style={styles.error}>Échec de la mise à jour.</Text> : null}

      {data?.items.length ? (
        <PaginationBar
          page={page}
          hasMore={data.hasMore}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      ) : null}
    </Card>
  );
}

/** A passenger's booking still counts as "active" for this trajet in these statuses — matches the web's `ACTIVE_BOOKING` set. */
const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'awaiting_payment', 'confirmed']);

function BookingSection({
  trajetId,
  seatsAvailable,
  cancelled,
  paymentMethods,
}: {
  trajetId: string;
  seatsAvailable: number;
  cancelled: boolean;
  paymentMethods: RidePaymentMethod[];
}) {
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [seats, setSeats] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<RidePaymentMethod | null>(paymentMethods[0] ?? null);
  // Bridges the gap between a mutation succeeding and the query below
  // refetching; the query is the actual source of truth (so a passenger
  // reopening this screen in a later session still sees their booking,
  // rather than only right after the in-session mutation — see mes-
  // reservations/trajet-booking-form.tsx on web for the same pattern).
  const [optimisticBooking, setOptimisticBooking] = useState<{ id: string; status: string } | null>(null);

  const myBookingsQueryKey = ['me', 'bookings', 'trajet', trajetId] as const;
  const { data: myBookings, isLoading: isMyBookingsLoading } = useQuery({
    queryKey: myBookingsQueryKey,
    enabled: !!session?.user,
    queryFn: async () => {
      const res = await api.me.bookings.$get({ query: { page: '1', limit: '50' } });
      if (!res.ok) return [];
      const body = await res.json();
      return body.items.filter(
        (item) => item.trajetId === trajetId && ACTIVE_BOOKING_STATUSES.has(item.status),
      );
    },
  });
  const myBooking = optimisticBooking ?? myBookings?.[0] ?? null;

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!paymentMethod) throw new Error('Choisissez un moyen de paiement.');
      const seatsNumber = Math.max(1, Math.min(seatsAvailable, Number(seats) || 1));
      const res = await api.trajets[':id'].book.$post({
        param: { id: trajetId },
        json: { seats: seatsNumber, paymentMethod },
      });
      if (!res.ok) throw new Error('Failed to book');
      return res.json();
    },
    onSuccess: (data) => {
      setOptimisticBooking({ id: data.id, status: data.status });
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
      queryClient.invalidateQueries({ queryKey: myBookingsQueryKey });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!myBooking) throw new Error('No active booking to cancel');
      const res = await api.trajets[':id'].bookings[':bookingId'].cancel.$post({
        param: { id: trajetId, bookingId: myBooking.id },
      });
      if (!res.ok) throw new Error('Failed to cancel');
      return res.json();
    },
    onSuccess: () => {
      setOptimisticBooking(null);
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
      queryClient.invalidateQueries({ queryKey: myBookingsQueryKey });
    },
  });

  if (isSessionPending) return null;

  if (!session?.user) {
    return (
      <Card>
        <Text style={styles.value}>Connectez-vous pour réserver ce trajet.</Text>
      </Card>
    );
  }

  if (isMyBookingsLoading) return null;

  if (!myBooking && cancelled) return null;

  if (!myBooking && seatsAvailable < 1) {
    return (
      <Card>
        <Text style={styles.value}>Ce trajet est complet.</Text>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <Text style={styles.cardTitle}>Réservation</Text>
      {myBooking ? (
        <>
          <Text style={styles.value}>Statut : {STATUS_LABELS[myBooking.status] ?? myBooking.status}</Text>
          {myBooking.status === 'awaiting_payment' ? (
            <Button label="Payer maintenant" size="sm" onPress={() => router.push(`/paiement/${myBooking.id}`)} />
          ) : null}
          {myBooking.status === 'pending' || myBooking.status === 'confirmed' ? (
            <Button
              label={cancelMutation.isPending ? 'Annulation…' : 'Annuler ma réservation'}
              variant="outline"
              size="sm"
              disabled={cancelMutation.isPending}
              onPress={() => cancelMutation.mutate()}
            />
          ) : null}
          {cancelMutation.isError ? <Text style={styles.error}>Échec de l'annulation.</Text> : null}
          <BookingMessages bookingId={myBooking.id} />
        </>
      ) : (
        <>
          <TextField label="Nombre de places" value={seats} onChangeText={setSeats} keyboardType="number-pad" />
          {paymentMethods.length > 0 ? (
            <View>
              <Text style={styles.label}>Moyen de paiement</Text>
              <View style={styles.row}>
                {paymentMethods.map((method) => (
                  <Button
                    key={method}
                    label={PAYMENT_METHOD_LABELS[method]}
                    size="sm"
                    variant={paymentMethod === method ? 'primary' : 'outline'}
                    onPress={() => setPaymentMethod(method)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <Button
            label={bookMutation.isPending ? 'Réservation…' : 'Réserver'}
            disabled={bookMutation.isPending || !paymentMethod}
            onPress={() => bookMutation.mutate()}
          />
          {bookMutation.isError ? <Text style={styles.error}>Échec de la réservation.</Text> : null}
        </>
      )}
    </Card>
    {myBooking?.status === 'confirmed' ? <LiveLocationView trajetId={trajetId} /> : null}
    </>
  );
}

export default function TrajetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = authClient.useSession();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trajets', id],
    queryFn: async () => {
      const res = await api.trajets[':id'].$get({ param: { id } });
      if (!res.ok) throw new Error('Failed to load trajet');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <ScreenContainer>
        <LoadingState label="Chargement du trajet…" />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer>
        <ErrorState label="Impossible de charger ce trajet." />
      </ScreenContainer>
    );
  }

  const isOwner = session?.user?.id === data.driverId;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        {data.cancelledAt ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Ce trajet a été annulé par le conducteur.</Text>
          </View>
        ) : null}

        <Card>
          <Text style={styles.title}>
            {data.departureCity} → {data.destinationCity}
          </Text>
          <View>
            <Text style={styles.label}>Départ</Text>
            <Text style={styles.value}>{formatDateTime(data.departureDateTime)}</Text>
          </View>
          <View>
            <Text style={styles.label}>Places</Text>
            <Text style={styles.value}>
              {data.seatsAvailable}/{data.seatsTotal}
            </Text>
          </View>
          <View>
            <Text style={styles.label}>Prix</Text>
            <Text style={styles.value}>{formatPrice(data.pricePerSeat)}</Text>
          </View>
          {data.comfort ? (
            <View>
              <Text style={styles.label}>Confort</Text>
              <Text style={styles.value}>{data.comfort}</Text>
            </View>
          ) : null}
          {data.baggageAllowance ? (
            <View>
              <Text style={styles.label}>Bagages</Text>
              <Text style={styles.value}>{data.baggageAllowance}</Text>
            </View>
          ) : null}
          <View>
            <Text style={styles.label}>Trajet</Text>
            <Text style={styles.value}>
              {data.hasIntermediateStop ? 'Avec arrêt intermédiaire' : 'Sans arrêt intermédiaire'}
            </Text>
          </View>
          {data.amenities.length > 0 ? (
            <View>
              <Text style={styles.label}>Options</Text>
              <Text style={styles.value}>
                {data.amenities.map((amenity) => AMENITY_LABELS[amenity]).join(' · ')}
              </Text>
            </View>
          ) : null}
          {data.description ? (
            <View>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.value}>{data.description}</Text>
            </View>
          ) : null}
        </Card>

        <DriverProfile driver={data.driver} />

        {isOwner ? (
          <>
            <LiveLocationShare trajetId={id} cancelled={!!data.cancelledAt} />
            <OwnerActions trajetId={id} cancelled={!!data.cancelledAt} />
            <TrajetBookingsList trajetId={id} departureDateTime={data.departureDateTime} />
          </>
        ) : (
          <BookingSection
            trajetId={id}
            seatsAvailable={data.seatsAvailable}
            cancelled={!!data.cancelledAt}
            paymentMethods={data.paymentMethods}
          />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.foreground },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  row: { flexDirection: 'row', gap: spacing.sm },
  bookingItem: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: { fontSize: fontSize.xs, color: colors.mutedForeground },
  value: { fontSize: fontSize.sm, color: colors.foreground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  driverHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  verifiedBadge: {
    backgroundColor: colors.secondary + '26',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  verifiedBadgeText: { fontSize: fontSize.xs, color: colors.secondary, fontWeight: '600' },
  unverifiedBadge: {
    backgroundColor: colors.mutedForeground + '1a',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  unverifiedBadgeText: { fontSize: fontSize.xs, color: colors.mutedForeground, fontWeight: '600' },
  banner: {
    backgroundColor: colors.destructive + '1a',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bannerText: { fontSize: fontSize.sm, color: colors.destructive },
});
