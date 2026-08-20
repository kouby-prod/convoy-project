'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isPastDue, remainingDueLabel } from '@/lib/booking-money';

export function DueCountdown({
  dueAt,
  paid = false,
}: {
  dueAt: string;
  paid?: boolean;
}) {
  const t = useTranslations('Paiement');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (paid) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [paid]);

  if (paid) return null;
  if (isPastDue(dueAt)) {
    return <p className="text-sm text-destructive">{t('dueExpired')}</p>;
  }
  const remaining = remainingDueLabel(dueAt, now);
  if (!remaining) return null;
  return <p className="text-sm text-muted-foreground">{t('dueIn', { remaining })}</p>;
}
