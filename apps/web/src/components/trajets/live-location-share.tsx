'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { useLiveLocationShare } from '@/hooks/use-live-location-share';

/** Driver-side control for the trip tab: start/stop live position sharing for this trajet. */
export function LiveLocationShare({ trajetId, cancelled }: { trajetId: string; cancelled: boolean }) {
  const t = useTranslations('Trajets.ownerWorkspace.liveLocation');
  const { status, error, start, stop, isSharing } = useLiveLocationShare(trajetId);

  if (cancelled) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error === 'unsupported' ? <FormAlert>{t('unsupported')}</FormAlert> : null}
        {error === 'permission-denied' ? <FormAlert>{t('permissionDenied')}</FormAlert> : null}
        {error === 'send-failed' ? <FormAlert>{t('sendFailed')}</FormAlert> : null}

        <div className="flex flex-wrap items-center gap-3">
          {isSharing ? (
            <Button type="button" variant="outline" onClick={stop}>
              {t('stop')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={start}
              disabled={status === 'requesting'}
            >
              {status === 'requesting' ? t('requesting') : t('start')}
            </Button>
          )}
          {isSharing ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-green">
              <span className="size-2 animate-pulse rounded-full bg-brand-green" aria-hidden />
              {t('live')}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
