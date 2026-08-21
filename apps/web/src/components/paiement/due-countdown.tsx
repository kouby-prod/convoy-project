'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isPastDue, remainingDueLabel, remainingDueMs } from '@/lib/booking-money';
import { cn } from '@/lib/utils';

export function DueCountdown({
  dueAt,
  paid = false,
  emphasis = 'inline',
}: {
  dueAt: string;
  paid?: boolean;
  emphasis?: 'inline' | 'hero';
}) {
  const t = useTranslations('Paiement');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (paid) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [paid]);

  if (paid) return null;
  if (isPastDue(dueAt)) {
    return (
      <p className={cn('text-sm text-destructive', emphasis === 'hero' && 'font-medium')}>
        {t('dueExpired')}
      </p>
    );
  }
  const remaining = remainingDueLabel(dueAt, now);
  const ms = remainingDueMs(dueAt, now);
  if (!remaining) return null;
  const urgent = ms !== null && ms < 60_000;

  if (emphasis === 'hero') {
    return (
      <div className={cn('grid gap-0.5', urgent && 'text-destructive')}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('windowLabel')}
        </p>
        <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">
          {remaining}
        </p>
        <p className="text-sm text-muted-foreground">{t('windowHint')}</p>
      </div>
    );
  }

  return (
    <p className={cn('text-sm tabular-nums', urgent ? 'font-medium text-destructive' : 'text-foreground')}>
      {t('dueIn', { remaining })}
    </p>
  );
}
