'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { NotificationPreference } from '@carpool/schemas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FormAlert } from '@/components/ui/form-alert';
import { CardSkeleton } from '@/components/ui/list-skeleton';
import { toast } from '@/components/ui/toast';
import { fetchNotificationPreferences, saveNotificationPreferences } from '@/lib/notifications';

const PREFS_KEY = ['notification-preferences'] as const;

/** Email and in-app channel switches — missing API row means both on. */
export function NotificationPrefsForm() {
  const t = useTranslations('Parametres.notifications');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: PREFS_KEY,
    queryFn: fetchNotificationPreferences,
  });
  const mutation = useMutation({
    mutationFn: saveNotificationPreferences,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: PREFS_KEY });
      const previous = queryClient.getQueryData<NotificationPreference>(PREFS_KEY);
      queryClient.setQueryData(PREFS_KEY, next);
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) queryClient.setQueryData(PREFS_KEY, context.previous);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(PREFS_KEY, saved);
      toast(t('success'));
    },
  });

  function toggle(key: keyof NotificationPreference, checked: boolean) {
    const current = query.data;
    if (!current || mutation.isPending) return;
    mutation.mutate({ ...current, [key]: checked });
  }

  if (query.isLoading) return <CardSkeleton rows={3} label={t('loading')} />;

  const prefs = query.data;
  const error = query.error ? t('loadError') : mutation.error ? t('error') : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">{t('description')}</p>
        {error ? <FormAlert>{error}</FormAlert> : null}
        {prefs ? (
          <div className="grid gap-2">
            <Checkbox
              label={t('email')}
              checked={prefs.emailEnabled}
              disabled={mutation.isPending}
              onChange={(event) => toggle('emailEnabled', event.target.checked)}
            />
            <Checkbox
              label={t('inApp')}
              checked={prefs.inAppEnabled}
              disabled={mutation.isPending}
              onChange={(event) => toggle('inAppEnabled', event.target.checked)}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
