'use client';

import { useTranslations } from 'next-intl';
import { BadgeCheck, Clock, CircleDashed, ShieldAlert } from 'lucide-react';
import type { DriverVerification, DriverVerificationStatus } from '@carpool/schemas';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';

const CHIP_STYLES: Record<
  DriverVerificationStatus,
  { variant: NonNullable<BadgeProps['variant']>; Icon: typeof BadgeCheck }
> = {
  incomplete: { variant: 'neutral', Icon: CircleDashed },
  pending: { variant: 'warning', Icon: Clock },
  rejected: { variant: 'destructive', Icon: ShieldAlert },
  approved: { variant: 'success', Icon: BadgeCheck },
};

/**
 * A driver's overall standing across both required documents, in one pill.
 *
 * Distinct from `DocumentStatusBadge`, which describes a single file. On a
 * review row the two sit side by side and answer different questions: "is this
 * licence acceptable" versus "is this driver cleared to drive" — a reviewer can
 * approve the first without the second becoming true, and conflating them is
 * how a half-verified driver gets treated as done.
 */
export function VerificationChip({ verification }: { verification: DriverVerification }) {
  const t = useTranslations('Documents');
  const { status, approvedCount, requiredCount } = verification;
  const { variant, Icon } = CHIP_STYLES[status];

  return (
    <Badge variant={variant}>
      <Icon aria-hidden strokeWidth={2.5} />
      {t(`verification.${status}.chip`)}
      <span className="tabular-nums opacity-70">
        {approvedCount}/{requiredCount}
      </span>
    </Badge>
  );
}
