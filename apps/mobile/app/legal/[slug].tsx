import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { LegalPageView } from '@/components/legal/LegalPageView';
import { LEGAL_SLUGS, legalContentFor, type LegalSlug } from '@/lib/legal-content';
import { colors, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

export default function LegalSlugScreen() {
  const { t, locale } = useI18n();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  if (!isLegalSlug(slug)) {
    return (
      <ScreenContainer>
        <Text style={{ fontSize: fontSize.sm, color: colors.destructive }}>{t('legal.notFound')}</Text>
      </ScreenContainer>
    );
  }

  return <LegalPageView content={legalContentFor(slug, locale)} />;
}
