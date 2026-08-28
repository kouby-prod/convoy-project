import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useI18n, SUPPORTED_LOCALES } from '@/lib/i18n';
import { colors, spacing, fontSize } from '@/lib/theme';

const LOCALE_LABEL_KEYS = {
  fr: 'language.french',
  en: 'language.english',
} as const;

/** fr/en toggle, persisted via `expo-secure-store` — see lib/i18n/index.tsx. */
export function LanguageSwitcher() {
  const { t, locale, setLocale } = useI18n();

  return (
    <Card>
      <Text style={styles.cardTitle}>{t('language.title')}</Text>
      <View style={styles.row}>
        {SUPPORTED_LOCALES.map((option) => (
          <Button
            key={option}
            label={t(LOCALE_LABEL_KEYS[option])}
            size="sm"
            variant={locale === option ? 'primary' : 'outline'}
            onPress={() => setLocale(option)}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  row: { flexDirection: 'row', gap: spacing.sm },
});
