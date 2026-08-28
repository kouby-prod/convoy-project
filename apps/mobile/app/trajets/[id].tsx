import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isWithinLocationSharingWindow, type RidePaymentMethod, type Trajet } from '@carpool/schemas';
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
import { AMENITY_LABEL_KEYS } from '@/lib/amenities';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { useI18n, type MessageKey, type TFunction } from '@/lib/i18n';

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  pending: 'common.bookingStatus.pending',
  awaiting_payment: 'common.bookingStatus.awaitingPayment',
  confirmed: 'common.bookingStatus.confirmed',
  rejected: 'common.bookingStatus.rejected',
  cancelled: 'common.bookingStatus.cancelled',
  expired: 'common.bookingStatus.expired',
};

function statusLabel(t: TFunction, status: string): string {
  const key = STATUS_LABEL_KEYS[status];
  return key ? t(key) : status;
}

const PAYMENT_METHOD_LABEL_KEYS: Record<RidePaymentMethod, MessageKey> = {
  card: 'common.paymentMethod.card',
  interac: 'common.paymentMethod.interac',
  cash: 'common.paymentMethod.cash',
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
  const { t } = useI18n();
  const name = [driver.firstName, driver.lastName].filter(Boolean).join(' ') || '—';
  const vehicleLine = [driver.carMake, driver.carModel].filter(Boolean).join(' ');

  return (
    <Card>
      <View style={styles.driverHeaderRow}>
        <Text style={styles.cardTitle}>{name}</Text>
        <View style={driver.verified ? styles.verifiedBadge : styles.unverifiedBadge}>
          <Text style={driver.verified ? styles.verifiedBadgeText : styles.unverifiedBadgeText}>
            {driver.verified ? t('trajetDetail.driverProfile.verified') : t('trajetDetail.driverProfile.unverified')}
          </Text>
        </View>
      </View>
      <Text style={styles.value}>
        {driver.rating !== null
          ? t('trajetDetail.driverProfile.ratingWithReviews', {
              rating: driver.rating.toFixed(1),
              count: driver.reviewCount ?? 0,
            })
          : t('trajetDetail.driverProfile.noReviews')}
      </Text>
      {vehicleLine ? <Text style={styles.value}>{vehicleLine}</Text> : null}
      {driver.carSeats !== null ? (
        <Text style={styles.value}>{t('trajetDetail.driverProfile.seatsInVehicle', { count: driver.carSeats })}</Text>
      ) : null}
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
  const { t } = useI18n();
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
      <Text style={styles.cardTitle}>{t('trajetDetail.ownerActions.title')}</Text>
      {confirming ? (
        <>
          <Text style={styles.value}>{t('trajetDetail.ownerActions.confirmCancel')}</Text>
          <View style={styles.row}>
            <Button
              label={cancelTrajetMutation.isPending ? t('trajetDetail.ownerActions.cancelling') : t('trajetDetail.ownerActions.yesCancel')}
              variant="destructive"
              size="sm"
              disabled={cancelTrajetMutation.isPending}
              onPress={() => cancelTrajetMutation.mutate()}
            />
            <Button label={t('trajetDetail.ownerActions.back')} variant="outline" size="sm" onPress={() => setConfirming(false)} />
          </View>
        </>
      ) : (
        <Button label={t('trajetDetail.ownerActions.cancelTrip')} variant="outline" size="sm" onPress={() => setConfirming(true)} />
      )}
      {cancelTrajetMutation.isError ? <Text style={styles.error}>{t('trajetDetail.ownerActions.cancelFailed')}</Text> : null}
    </Card>
  );
}

/**
 * Driver-only booking requests for a trajet — the mobile counterpart of
 * `apps/web/src/components/trajets/trajet-bookings.tsx`.
 */
function TrajetBookingsList({ trajetId, departureDateTime }: { trajetId: string; departureDateTime: string }) {
  const { t } = useI18n();
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
      <Text style={styles.cardTitle}>{t('trajetDetail.bookingsList.title')}</Text>
      {isLoading ? <LoadingState label={t('common.loading')} /> : null}
      {isError ? <ErrorState label={t('trajetDetail.bookingsList.error')} /> : null}
      {!isLoading && !isError && !data?.items.length ? (
        <Text style={styles.value}>{t('trajetDetail.bookingsList.empty')}</Text>
      ) : null}

      {data?.items.map((booking) => (
        <View key={booking.id} style={styles.bookingItem}>
          <View style={styles.bookingRow}>
            <View>
              <Text style={styles.value}>{t('common.seatsCount', { count: booking.seats })}</Text>
              <Text style={styles.label}>{statusLabel(t, booking.status)}</Text>
            </View>
            {booking.status === 'pending' ? (
              <View style={styles.row}>
                <Button
                  label={t('trajetDetail.bookingsList.accept')}
                  size="sm"
                  disabled={statusMutation.isPending}
                  onPress={() => statusMutation.mutate({ bookingId: booking.id, status: 'confirmed' })}
                />
                <Button
                  label={t('trajetDetail.bookingsList.reject')}
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
              <Text style={styles.value}>{t('trajetDetail.bookingsList.reviewSent')}</Text>
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
                label={t('trajetDetail.bookingsList.ratePassenger')}
                variant="outline"
                size="sm"
                onPress={() => setOpenReviewId(booking.id)}
              />
            )
          ) : null}
        </View>
      ))}

      {statusMutation.isError ? <Text style={styles.error}>{t('trajetDetail.bookingsList.updateFailed')}</Text> : null}

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
  departureDateTime,
  arrivalDateTime,
}: {
  trajetId: string;
  seatsAvailable: number;
  cancelled: boolean;
  paymentMethods: RidePaymentMethod[];
  departureDateTime: string;
  arrivalDateTime: string | null;
}) {
  const { t } = useI18n();
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
      // `limit: '100'` is the API's hard max (PaginationQuerySchema), not a
      // real page size — this filters client-side for the current trajetId,
      // so a passenger with more upcoming bookings than the page would never
      // see this trajet's own booking on page 1 (bookings are ordered by
      // soonest departure, not recency). Mirrors the same mitigation on web's
      // trajet-detail.tsx / trajet-booking-form.tsx.
      const res = await api.me.bookings.$get({ query: { page: '1', limit: '100' } });
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
        <Text style={styles.value}>{t('trajetDetail.bookingSection.signInToBook')}</Text>
      </Card>
    );
  }

  if (isMyBookingsLoading) return null;

  if (!myBooking && cancelled) return null;

  if (!myBooking && seatsAvailable < 1) {
    return (
      <Card>
        <Text style={styles.value}>{t('trajetDetail.bookingSection.full')}</Text>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <Text style={styles.cardTitle}>{t('trajetDetail.bookingSection.title')}</Text>
      {myBooking ? (
        <>
          <Text style={styles.value}>
            {t('trajetDetail.bookingSection.statusLabel', { status: statusLabel(t, myBooking.status) })}
          </Text>
          {myBooking.status === 'awaiting_payment' ? (
            <Button
              label={t('trajetDetail.bookingSection.payNow')}
              size="sm"
              onPress={() => router.push(`/paiement/${myBooking.id}`)}
            />
          ) : null}
          {myBooking.status === 'pending' || myBooking.status === 'confirmed' ? (
            <Button
              label={cancelMutation.isPending ? t('trajetDetail.bookingSection.cancelling') : t('trajetDetail.bookingSection.cancelBooking')}
              variant="outline"
              size="sm"
              disabled={cancelMutation.isPending}
              onPress={() => cancelMutation.mutate()}
            />
          ) : null}
          {cancelMutation.isError ? <Text style={styles.error}>{t('trajetDetail.bookingSection.cancelFailed')}</Text> : null}
          <BookingMessages bookingId={myBooking.id} />
        </>
      ) : (
        <>
          <TextField label={t('trajetDetail.bookingSection.seatsLabel')} value={seats} onChangeText={setSeats} keyboardType="number-pad" />
          {paymentMethods.length > 0 ? (
            <View>
              <Text style={styles.label}>{t('trajetDetail.bookingSection.paymentMethodLabel')}</Text>
              <View style={styles.row}>
                {paymentMethods.map((method) => (
                  <Button
                    key={method}
                    label={t(PAYMENT_METHOD_LABEL_KEYS[method])}
                    size="sm"
                    variant={paymentMethod === method ? 'primary' : 'outline'}
                    onPress={() => setPaymentMethod(method)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <Button
            label={bookMutation.isPending ? t('trajetDetail.bookingSection.booking') : t('trajetDetail.bookingSection.book')}
            disabled={bookMutation.isPending || !paymentMethod}
            onPress={() => bookMutation.mutate()}
          />
          {bookMutation.isError ? <Text style={styles.error}>{t('trajetDetail.bookingSection.bookFailed')}</Text> : null}
        </>
      )}
    </Card>
    {myBooking?.status === 'confirmed' && isWithinLocationSharingWindow(departureDateTime, arrivalDateTime) ? (
      <LiveLocationView trajetId={trajetId} />
    ) : null}
    </>
  );
}

export default function TrajetDetailScreen() {
  const { t } = useI18n();
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
        <LoadingState label={t('trajetDetail.loading')} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer>
        <ErrorState label={t('trajetDetail.error')} />
      </ScreenContainer>
    );
  }

  const isOwner = session?.user?.id === data.driverId;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        {data.cancelledAt ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{t('trajetDetail.cancelledBanner')}</Text>
          </View>
        ) : null}

        <Card>
          <Text style={styles.title}>
            {data.departureCity} → {data.destinationCity}
          </Text>
          <View>
            <Text style={styles.label}>{t('trajetDetail.departure')}</Text>
            <Text style={styles.value}>{formatDateTime(data.departureDateTime)}</Text>
          </View>
          <View>
            <Text style={styles.label}>{t('trajetDetail.seats')}</Text>
            <Text style={styles.value}>
              {data.seatsAvailable}/{data.seatsTotal}
            </Text>
          </View>
          <View>
            <Text style={styles.label}>{t('trajetDetail.price')}</Text>
            <Text style={styles.value}>{formatPrice(data.pricePerSeat)}</Text>
          </View>
          {data.comfort ? (
            <View>
              <Text style={styles.label}>{t('trajetDetail.comfort')}</Text>
              <Text style={styles.value}>{data.comfort}</Text>
            </View>
          ) : null}
          {data.baggageAllowance ? (
            <View>
              <Text style={styles.label}>{t('trajetDetail.baggage')}</Text>
              <Text style={styles.value}>{data.baggageAllowance}</Text>
            </View>
          ) : null}
          <View>
            <Text style={styles.label}>{t('trajetDetail.tripType')}</Text>
            <Text style={styles.value}>
              {data.hasIntermediateStop ? t('trajetDetail.tripWithStop') : t('trajetDetail.tripDirect')}
            </Text>
          </View>
          {data.amenities.length > 0 ? (
            <View>
              <Text style={styles.label}>{t('trajetDetail.options')}</Text>
              <Text style={styles.value}>
                {data.amenities.map((amenity) => t(AMENITY_LABEL_KEYS[amenity])).join(' · ')}
              </Text>
            </View>
          ) : null}
          {data.description ? (
            <View>
              <Text style={styles.label}>{t('trajetDetail.description')}</Text>
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
            departureDateTime={data.departureDateTime}
            arrivalDateTime={data.arrivalDateTime}
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
