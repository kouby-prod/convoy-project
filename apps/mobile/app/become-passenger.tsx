import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { LoadingState } from '@/components/ui/StateMessage';
import { ChecklistStep } from '@/components/onboarding/ChecklistStep';
import { getBecomePassengerContent } from '@/lib/legal-content';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

/** Compact passenger onboarding checklist — mobile counterpart of the web's `BecomePassengerChecklist`. */
export default function BecomePassengerScreen() {
  const { locale } = useI18n();
  const BECOME_PASSENGER = getBecomePassengerContent(locale);
  const bookingsQuery = useQuery({
    queryKey: ['me', 'bookings', 'onboarding'],
    queryFn: async () => {
      const res = await api.me.bookings.$get({ query: { page: '1', limit: '1' } });
      if (!res.ok) throw new Error('Failed to load bookings');
      return res.json();
    },
  });

  if (bookingsQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState label={BECOME_PASSENGER.loading} />
      </ScreenContainer>
    );
  }

  const hasBooking = (bookingsQuery.data?.items.length ?? 0) > 0;
  const doneCount = 2 + (hasBooking ? 1 : 0);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{BECOME_PASSENGER.title}</Text>
        <Text style={styles.progress}>{BECOME_PASSENGER.progress(doneCount, 3)}</Text>

        <ChecklistStep index={1} title={BECOME_PASSENGER.account.title} description={BECOME_PASSENGER.account.description} done />
        <ChecklistStep
          index={2}
          title={BECOME_PASSENGER.search.title}
          description={BECOME_PASSENGER.search.description}
          done
          cta={BECOME_PASSENGER.search.cta}
          onPress={() => router.push('/recherche')}
        />
        <ChecklistStep
          index={3}
          title={BECOME_PASSENGER.booking.title}
          description={BECOME_PASSENGER.booking.description}
          done={hasBooking}
          cta={hasBooking ? BECOME_PASSENGER.booking.doneCta : BECOME_PASSENGER.booking.cta}
          onPress={() => router.push(hasBooking ? '/mes-reservations' : '/recherche')}
        />

        <View style={styles.guide}>
          <Text style={styles.guideTitle}>{BECOME_PASSENGER.guide}</Text>
          {BECOME_PASSENGER.sections.map((section) => (
            <View key={section.heading} style={styles.guideSection}>
              <Text style={styles.guideHeading}>{section.heading}</Text>
              <Text style={styles.guideBody}>{section.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.foreground },
  progress: { fontSize: fontSize.sm, fontWeight: '600', color: colors.foreground },
  guide: { gap: spacing.md, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  guideTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.foreground },
  guideSection: { gap: 2 },
  guideHeading: { fontSize: fontSize.sm, fontWeight: '600', color: colors.foreground },
  guideBody: { fontSize: fontSize.sm, color: colors.mutedForeground },
});
