'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, CircleDashed, CreditCard, XCircle } from 'lucide-react';
import type { BookingStatus } from '@carpool/schemas';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const STYLES: Record<
  BookingStatus,
  { variant: NonNullable<BadgeProps['variant']>; Icon: typeof Clock }
> = {
  pending: { variant: 'warning', Icon: Clock },
  awaiting_payment: { variant: 'primary', Icon: CreditCard },
  confirmed: { variant: 'success', Icon: CheckCircle2 },
  rejected: { variant: 'destructive', Icon: XCircle },
  cancelled: { variant: 'neutral', Icon: CircleDashed },
  expired: { variant: 'neutral', Icon: CircleDashed },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const t = useTranslations('Trajets');
  const { variant, Icon } = STYLES[status];

  return (
    <Badge variant={variant}>
      <Icon aria-hidden strokeWidth={2.5} />
      {t(`bookings.status.${status}`)}
    </Badge>
  );
}
