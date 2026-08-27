import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import type { LegalContent } from '@/lib/legal-content';
import { colors, radius, spacing, fontSize } from '@/lib/theme';

/** Generic renderer for a title + optional disclaimer + heading/body sections — mobile counterpart of the web's `LegalPage`. */
export function LegalPageView({ content }: { content: LegalContent }) {
  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.lastUpdated}>{content.lastUpdated}</Text>

        {content.disclaimer ? (
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>{content.disclaimer}</Text>
          </View>
        ) : null}

        {content.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.body.split('\n\n').map((paragraph) => (
              <Text key={paragraph} style={styles.body}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.foreground },
  lastUpdated: { fontSize: fontSize.xs, color: colors.mutedForeground },
  disclaimer: {
    borderWidth: 1,
    borderColor: colors.destructive,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  disclaimerText: { fontSize: fontSize.sm, color: colors.destructive },
  section: { gap: spacing.xs },
  heading: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  body: { fontSize: fontSize.sm, color: colors.mutedForeground, lineHeight: 20 },
});
