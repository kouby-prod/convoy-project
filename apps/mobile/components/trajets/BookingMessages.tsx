import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing, fontSize } from '@/lib/theme';

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

/**
 * Inline message thread for one booking — mobile counterpart of
 * `apps/web/src/components/trajets/booking-messages.tsx`. Either the
 * trajet's driver or the booking's passenger can read/post here (enforced
 * server-side), independent of the booking's status. Collapsed by default
 * and only fetches once opened. Threads are short (one trip, two people), so
 * this fetches a single generous page (`limit=100`) rather than paginating.
 */
export function BookingMessages({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [body, setBody] = useState('');

  const queryKey = ['bookings', bookingId, 'messages'];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    enabled: isOpen,
    queryFn: async () => {
      const res = await api.bookings[':bookingId'].messages.$get({
        param: { bookingId },
        query: { limit: '100' },
      });
      if (!res.ok) throw new Error('Failed to load messages');
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.bookings[':bookingId'].messages.$post({
        param: { bookingId },
        json: { body },
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    },
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <View style={styles.container}>
      <Button
        label={isOpen ? 'Masquer les messages' : 'Voir les messages'}
        variant="outline"
        size="sm"
        onPress={() => setIsOpen((open) => !open)}
      />

      {isOpen ? (
        <View style={styles.thread}>
          {isLoading ? <Text style={styles.hint}>Chargement…</Text> : null}
          {isError ? <Text style={styles.error}>Impossible de charger les messages.</Text> : null}
          {!isLoading && !isError && !data?.items.length ? (
            <Text style={styles.hint}>Aucun message pour l'instant.</Text>
          ) : null}

          {data?.items.map((item) => {
            const isOwn = item.senderId === session?.user?.id;
            return (
              <View key={item.id} style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
                <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{item.body}</Text>
                  <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
                    {formatTime(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          })}

          <View style={styles.composer}>
            <View style={styles.composerInput}>
              <TextField label="Message" value={body} onChangeText={setBody} placeholder="Écrire un message…" multiline />
            </View>
            <Button
              label={mutation.isPending ? 'Envoi…' : 'Envoyer'}
              size="sm"
              disabled={mutation.isPending || !body.trim()}
              onPress={() => mutation.mutate()}
            />
          </View>
          {mutation.isError ? <Text style={styles.error}>Échec de l'envoi.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  thread: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  hint: { fontSize: fontSize.sm, color: colors.mutedForeground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  bubbleOwn: { backgroundColor: colors.primary },
  bubbleOther: { backgroundColor: colors.muted },
  bubbleText: { fontSize: fontSize.sm, color: colors.foreground },
  bubbleTextOwn: { color: colors.primaryForeground },
  bubbleTime: { fontSize: 10, color: colors.mutedForeground, marginTop: 2 },
  bubbleTimeOwn: { color: colors.primaryForeground },
  composer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  composerInput: { flex: 1 },
});
