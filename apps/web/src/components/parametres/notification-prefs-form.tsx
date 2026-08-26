'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { NotificationPreference } from '@carpool/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FormAlert } from '@/components/ui/form-alert';
import { CardSkeleton } from '@/components/ui/list-skeleton';
import { toast } from '@/components/ui/toast';
import { useWebPush } from '@/hooks/use-web-push';
import { fetchNotificationPreferences, saveNotificationPreferences } from '@/lib/notifications';

const PREFS_KEY = ['notification-preferences'] as const;

/** Email, in-app and push channel switches — missing API row means every channel on. */
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

  const webPush = useWebPush();

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
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
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
            <Checkbox
              label={t('push')}
              checked={prefs.pushEnabled}
              disabled={mutation.isPending}
              onChange={(event) => toggle('pushEnabled', event.target.checked)}
            />
            {prefs.pushEnabled ? (
              <div className="ml-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {webPush.status === 'unsupported' ? (
                  <span>{t('pushUnsupported')}</span>
                ) : webPush.status === 'subscribed' ? (
                  <>
                    <span>{t('pushDeviceEnabled')}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={webPush.isPending}
                      onClick={() => void webPush.unsubscribe()}
                    >
                      {t('pushDeviceDisable')}
                    </Button>
                  </>
                ) : (
                  <>
                    <span>{t('pushDeviceDisabled')}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={webPush.isPending || webPush.status === 'checking'}
                      onClick={() => void webPush.subscribe()}
                    >
                      {t('pushDeviceEnable')}
                    </Button>
                  </>
                )}
                {webPush.error === 'permission-denied' ? <span>{t('pushPermissionDenied')}</span> : null}
                {webPush.error === 'push-not-configured' ? <span>{t('pushNotConfigured')}</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
