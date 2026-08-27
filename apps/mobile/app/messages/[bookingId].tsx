import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchConversations } from '@/lib/conversations';
import { MessageThread } from '@/components/messages/MessageThread';
import { ReportThread } from '@/components/messages/ReportThread';
import { Button } from '@/components/ui/Button';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { LoadingState } from '@/components/ui/StateMessage';
import { colors, spacing, fontSize } from '@/lib/theme';

export default function ConversationScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);

  // Same cache key as the inbox tab — usually already warm, so this is
  // instant when the driver/passenger came from there.
  const { data, isLoading } = useQuery({
    queryKey: ['messages', 'inbox'],
    queryFn: fetchConversations,
  });
  const conversation = data?.find((item) => item.bookingId === bookingId);

  if (isLoading) {
    return (
      <ScreenContainer>
        <LoadingState label="Chargement…" />
      </ScreenContainer>
    );
  }

  const name = conversation?.counterpart.name || 'Utilisateur inconnu';
  const route = conversation ? `${conversation.trip.departureCity} → ${conversation.trip.arrivalCity}` : '';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.name}>{name}</Text>
          {conversation ? <Text style={styles.route}>{route}</Text> : null}
        </View>
        <View style={styles.headerActions}>
          <Button label="Signaler" variant="outline" size="sm" onPress={() => setReportOpen((v) => !v)} />
          {conversation ? (
            <Button
              label="Voir le trajet"
              variant="outline"
              size="sm"
              onPress={() => router.push(`/trajets/${conversation.trajetId}`)}
            />
          ) : null}
        </View>
      </View>

      {reportOpen && conversation ? (
        <ReportThread
          bookingId={bookingId}
          counterpartName={name}
          route={route}
          onClose={() => setReportOpen(false)}
        />
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <MessageThread bookingId={bookingId} />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  route: { fontSize: fontSize.xs, color: colors.mutedForeground },
});
