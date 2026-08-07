'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, Users, XCircle, type LucideIcon } from 'lucide-react';
import type { AdminStats } from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The dashboard's four counters.
 *
 * "Pending" leads because it is the only number that represents work: the others
 * are there for context. Each tile borrows the same colour its status badge uses
 * elsewhere, so the tile and the queue row below it read as the same thing.
 */
export function AdminStatsTiles({ stats }: { stats: AdminStats }) {
  const t = useTranslations('Admin');

  const tiles: { key: string; label: string; value: number; Icon: LucideIcon; tone: string }[] = [
    {
      key: 'pending',
      label: t('stats.pending'),
      value: stats.documents.pending,
      Icon: Clock,
      tone: 'bg-accent/25 text-accent-foreground',
    },
    {
      key: 'approved',
      label: t('stats.approved'),
      value: stats.documents.approved,
      Icon: CheckCircle2,
      tone: 'bg-success/15 text-success',
    },
    {
      key: 'rejected',
      label: t('stats.rejected'),
      value: stats.documents.rejected,
      Icon: XCircle,
      tone: 'bg-destructive/10 text-destructive',
    },
    {
      key: 'users',
      label: t('stats.users'),
      value: stats.users.total,
      Icon: Users,
      tone: 'bg-primary/10 text-primary',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map(({ key, label, value, Icon, tone }) => (
        <Card key={key}>
          <CardContent className="flex items-center gap-4 p-5 pt-5">
            <span
              className={cn('flex size-11 shrink-0 items-center justify-center rounded-md', tone)}
            >
              <Icon className="size-5" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
              <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
