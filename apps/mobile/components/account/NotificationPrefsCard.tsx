import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationPreference } from '@carpool/schemas';
import { fetchNotificationPreferences, saveNotificationPreferences } from '@/lib/notifications';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

/** Email / in-app channel switches — a missing API row reads as both channels on. */
export function NotificationPrefsCard() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: fetchNotificationPreferences,
  });

  const mutation = useMutation({
    mutationFn: saveNotificationPreferences,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ['notification-preferences'] });
      const previous = queryClient.getQueryData<NotificationPreference>(['notification-preferences']);
      queryClient.setQueryData(['notification-preferences'], next);
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) queryClient.setQueryData(['notification-preferences'], context.previous);
    },
  });

  function toggle(key: keyof NotificationPreference) {
    const current = query.data;
    if (!current || mutation.isPending) return;
    mutation.mutate({ ...current, [key]: !current[key] });
  }

  const prefs = query.data;

  return (
    <Card>
      <Text style={styles.cardTitle}>{t('notificationPrefs.title')}</Text>
      {query.isLoading ? <Text style={styles.value}>{t('notificationPrefs.loading')}</Text> : null}
      {query.isError ? <Text style={styles.error}>{t('notificationPrefs.error')}</Text> : null}
      {prefs ? (
        <>
          <View style={styles.row}>
            <Text style={styles.value}>{t('notificationPrefs.email')}</Text>
            <Button
              label={prefs.emailEnabled ? t('notificationPrefs.enabled') : t('notificationPrefs.disabled')}
              size="sm"
              variant={prefs.emailEnabled ? 'primary' : 'outline'}
              disabled={mutation.isPending}
              onPress={() => toggle('emailEnabled')}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.value}>{t('notificationPrefs.inApp')}</Text>
            <Button
              label={prefs.inAppEnabled ? t('notificationPrefs.enabled') : t('notificationPrefs.disabled')}
              size="sm"
              variant={prefs.inAppEnabled ? 'primary' : 'outline'}
              disabled={mutation.isPending}
              onPress={() => toggle('inAppEnabled')}
            />
          </View>
        </>
      ) : null}
      {mutation.isError ? <Text style={styles.error}>{t('notificationPrefs.saveFailed')}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  value: { fontSize: fontSize.sm, color: colors.foreground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
});
