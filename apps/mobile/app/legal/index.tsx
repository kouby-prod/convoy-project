import { ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Button } from '@/components/ui/Button';
import { legalContentFor } from '@/lib/legal-content';
import { colors, spacing, fontSize } from '@/lib/theme';

const GUIDES: { label: string; href: '/become-driver' | '/become-passenger' }[] = [
  { label: 'Comment devenir chauffeur', href: '/become-driver' },
  { label: 'Comment devenir passager', href: '/become-passenger' },
];

const TIPS_AND_LEGAL: { label: string; slug: 'driver-tips' | 'passenger-tips' | 'responsibility' | 'terms' | 'cgv' | 'contrat-conducteur' | 'privacy' }[] = [
  { label: legalContentFor('driver-tips').title, slug: 'driver-tips' },
  { label: legalContentFor('passenger-tips').title, slug: 'passenger-tips' },
  { label: legalContentFor('responsibility').title, slug: 'responsibility' },
  { label: legalContentFor('terms').title, slug: 'terms' },
  { label: legalContentFor('cgv').title, slug: 'cgv' },
  { label: legalContentFor('contrat-conducteur').title, slug: 'contrat-conducteur' },
  { label: legalContentFor('privacy').title, slug: 'privacy' },
];

/** Hub for the onboarding guides and legal/info pages — reached from Compte. */
export default function LegalIndexScreen() {
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Bien démarrer</Text>
        {GUIDES.map((item) => (
          <Button key={item.href} label={item.label} variant="outline" onPress={() => router.push(item.href)} />
        ))}

        <Text style={styles.sectionTitle}>Informations légales</Text>
        {TIPS_AND_LEGAL.map((item) => (
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
