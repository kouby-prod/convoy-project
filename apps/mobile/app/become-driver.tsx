import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { fetchMyEligibility } from '@/lib/eligibility';
import { fetchMyVehicle } from '@/lib/vehicles';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { LoadingState } from '@/components/ui/StateMessage';
import { ChecklistStep } from '@/components/onboarding/ChecklistStep';
import { getBecomeDriverContent } from '@/lib/legal-content';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

/** Live driver onboarding checklist — mobile counterpart of the web's `BecomeDriverChecklist`. Every screen here is already auth-gated, so "create an account" always reads as done. */
export default function BecomeDriverScreen() {
  const { locale } = useI18n();
  const BECOME_DRIVER = getBecomeDriverContent(locale);
  const eligibilityQuery = useQuery({ queryKey: ['my-eligibility'], queryFn: fetchMyEligibility });
  const vehicleQuery = useQuery({ queryKey: ['my-vehicle'], queryFn: fetchMyVehicle });
  const trajetsQuery = useQuery({
    queryKey: ['me', 'trajets', 'onboarding'],
    queryFn: async () => {
      const res = await api.me.trajets.$get({ query: { page: '1', limit: '1' } });
      if (!res.ok) throw new Error('Failed to load trajets');
      return res.json();
    },
  });

  if (eligibilityQuery.isLoading || vehicleQuery.isLoading || trajetsQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState label={BECOME_DRIVER.loading} />
      </ScreenContainer>
    );
  }

  const documentsDone = !!eligibilityQuery.data?.licenseNumber;
  const vehicleDone = !!vehicleQuery.data;
  const publishDone = (trajetsQuery.data?.items.length ?? 0) > 0;
  const doneCount = 1 + [documentsDone, vehicleDone, publishDone].filter(Boolean).length;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{BECOME_DRIVER.title}</Text>
        <Text style={styles.progress}>{BECOME_DRIVER.progress(doneCount, 4)}</Text>

        <ChecklistStep index={1} title={BECOME_DRIVER.account.title} description={BECOME_DRIVER.account.description} done />
        <ChecklistStep
          index={2}
          title={BECOME_DRIVER.documents.title}
          description={BECOME_DRIVER.documents.description}
          done={documentsDone}
          cta={documentsDone ? BECOME_DRIVER.documents.doneCta : BECOME_DRIVER.documents.cta}
          onPress={() => router.push('/documents')}
        />
        <ChecklistStep
          index={3}
          title={BECOME_DRIVER.vehicle.title}
          description={BECOME_DRIVER.vehicle.description}
          done={vehicleDone}
          cta={vehicleDone ? BECOME_DRIVER.vehicle.doneCta : BECOME_DRIVER.vehicle.cta}
          onPress={() => router.push('/vehicle')}
        />
        <ChecklistStep
          index={4}
          title={BECOME_DRIVER.publish.title}
          description={BECOME_DRIVER.publish.description}
          done={publishDone}
          cta={publishDone ? BECOME_DRIVER.publish.doneCta : BECOME_DRIVER.publish.cta}
          onPress={() => router.push(publishDone ? '/mes-trajets' : '/annoncer')}
        />

        <View style={styles.guide}>
          <Text style={styles.guideTitle}>{BECOME_DRIVER.guide}</Text>
          {BECOME_DRIVER.sections.map((section) => (
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
