import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState } from '@/components/ui/StateMessage';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
  expired: 'Expirée',
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(value));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(
    value,
  );
}

function DriverRating({ driverId }: { driverId: string }) {
  const { data } = useQuery({
    queryKey: ['drivers', driverId, 'rating'],
    queryFn: async () => {
      const res = await api.drivers[':driverId'].rating.$get({ param: { driverId } });
      if (!res.ok) throw new Error('Failed to load driver rating');
      return res.json();
    },
  });

  if (!data || data.reviewCount === 0 || data.averageRating === null) {
    return <Text style={styles.value}>Aucun avis</Text>;
  }
  return (
    <Text style={styles.value}>
      ★ {data.averageRating.toFixed(1)} ({data.reviewCount} avis)
    </Text>
  );
}

function BookingSection({ trajetId, seatsAvailable, cancelled }: { trajetId: string; seatsAvailable: number; cancelled: boolean }) {
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [seats, setSeats] = useState('1');
  const [myBooking, setMyBooking] = useState<{ id: string; status: string } | null>(null);

  const bookMutation = useMutation({
    mutationFn: async () => {
      const seatsNumber = Math.max(1, Math.min(seatsAvailable, Number(seats) || 1));
      const res = await api.trajets[':id'].book.$post({ param: { id: trajetId }, json: { seats: seatsNumber } });
      if (!res.ok) throw new Error('Failed to book');
      return res.json();
    },
    onSuccess: (data) => {
      setMyBooking({ id: data.id, status: data.status });
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
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
      setMyBooking(null);
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
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

  if (!myBooking && cancelled) return null;

  if (!myBooking && seatsAvailable < 1) {
    return (
      <Card>
        <Text style={styles.value}>Ce trajet est complet.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.cardTitle}>Réservation</Text>
      {myBooking ? (
        <>
          <Text style={styles.value}>Statut : {STATUS_LABELS[myBooking.status] ?? myBooking.status}</Text>
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
        </>
      ) : (
        <>
          <TextField label="Nombre de places" value={seats} onChangeText={setSeats} keyboardType="number-pad" />
          <Button
            label={bookMutation.isPending ? 'Réservation…' : 'Réserver'}
            disabled={bookMutation.isPending}
            onPress={() => bookMutation.mutate()}
          />
          {bookMutation.isError ? <Text style={styles.error}>Échec de la réservation.</Text> : null}
        </>
      )}
    </Card>
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
            <Text style={styles.label}>Note du conducteur</Text>
            <DriverRating driverId={data.driverId} />
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
          {data.description ? (
            <View>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.value}>{data.description}</Text>
            </View>
          ) : null}
        </Card>

        {isOwner ? (
          <Card>
            <Text style={styles.value}>Vous êtes le conducteur de ce trajet.</Text>
          </Card>
        ) : (
          <BookingSection trajetId={id} seatsAvailable={data.seatsAvailable} cancelled={!!data.cancelledAt} />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.foreground },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  label: { fontSize: fontSize.xs, color: colors.mutedForeground },
  value: { fontSize: fontSize.sm, color: colors.foreground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  banner: {
    backgroundColor: colors.destructive + '1a',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bannerText: { fontSize: fontSize.sm, color: colors.destructive },
});
