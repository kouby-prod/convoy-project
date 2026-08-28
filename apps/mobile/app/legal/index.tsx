import { ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Button } from '@/components/ui/Button';
import { legalContentFor, type LegalSlug } from '@/lib/legal-content';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

const GUIDES: { labelKey: 'legal.guideDriver' | 'legal.guidePassenger'; href: '/become-driver' | '/become-passenger' }[] = [
  { labelKey: 'legal.guideDriver', href: '/become-driver' },
  { labelKey: 'legal.guidePassenger', href: '/become-passenger' },
];

const TIPS_AND_LEGAL_SLUGS: LegalSlug[] = [
  'driver-tips',
  'passenger-tips',
  'responsibility',
  'terms',
  'cgv',
  'contrat-conducteur',
  'privacy',
  'mentions-legales',
];

/** Hub for the onboarding guides and legal/info pages — reached from Compte. */
export default function LegalIndexScreen() {
  const { t, locale } = useI18n();
  const tipsAndLegal = TIPS_AND_LEGAL_SLUGS.map((slug) => ({ slug, label: legalContentFor(slug, locale).title }));

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>{t('legal.startGuide')}</Text>
        {GUIDES.map((item) => (
          <Button
            key={item.href}
            label={t(item.labelKey)}
            variant="outline"
            onPress={() => router.push(item.href)}
          />
        ))}

        <Text style={styles.sectionTitle}>{t('legal.legalInfo')}</Text>
        {tipsAndLegal.map((item) => (
          <Button
            key={item.slug}
            label={item.label}
            variant="outline"
            onPress={() => router.push(`/legal/${item.slug}`)}
          />
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.mutedForeground,
    marginTop: spacing.md,
    textTransform: 'uppercase',
  },
});
