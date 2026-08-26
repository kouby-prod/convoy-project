'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, CircleDashed, RotateCcw, XCircle } from 'lucide-react';
import type { DocumentSlotStatus } from '@carpool/schemas';
import { Badge } from '@/components/ui/badge';

/**
 * The four states a required document can be in — the three stored statuses
 * plus `missing`, defined in the contract package because the backoffice rolls
 * the same set up into its progress chip.
 */
export type DocumentDisplayStatus = DocumentSlotStatus;

/**
 * One icon and one tint per status, exported so every surface that shows a
 * status reuses the SAME pair.
 *
 * Status must never be carried by colour alone: colour-blind users lose it
 * entirely, and anyone scanning quickly can miss it. Icon + colour together is
 * markedly faster to recognise than either on its own, and the components below
 * always render both alongside the translated word.
 */
export const DOCUMENT_STATUS_STYLES = {
  missing: { variant: 'neutral', Icon: CircleDashed, tone: 'text-muted-foreground' },
  pending: { variant: 'warning', Icon: Clock, tone: 'text-accent-foreground' },
  approved: { variant: 'success', Icon: CheckCircle2, tone: 'text-success' },
  rejected: { variant: 'destructive', Icon: XCircle, tone: 'text-destructive' },
  // Was approved once, but past its one-year re-verification window — a
  // renewal, not a refusal, so it gets its own icon rather than borrowing
  // `rejected`'s.
  expired: { variant: 'warning', Icon: RotateCcw, tone: 'text-accent-foreground' },
} as const;

const STATUS_STYLES = DOCUMENT_STATUS_STYLES;

/**
 * The one place a document status becomes a colour. Shared by the driver's page
 * and the backoffice queue so "rejected" never looks like two different things
 * depending on who is looking at it.
 */
export function DocumentStatusBadge({ status }: { status: DocumentDisplayStatus }) {
  const t = useTranslations('Documents');
  const { variant, Icon } = STATUS_STYLES[status];

  return (
    <Badge variant={variant}>
      <Icon aria-hidden strokeWidth={2.5} />
      {t(`status.${status}`)}
    </Badge>
  );
}
