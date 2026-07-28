'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, CircleDashed, XCircle } from 'lucide-react';
import type { DocumentStatus } from '@carpool/schemas';
import { Badge } from '@/components/ui/badge';

/**
 * `missing` is not a `DocumentStatus` — nothing is stored for a document the
 * driver has never sent. The checklist still has to show a state for it, so the
 * badge accepts it as a fourth, view-only case.
 */
export type DocumentDisplayStatus = DocumentStatus | 'missing';

const STATUS_STYLES = {
  missing: { variant: 'neutral', Icon: CircleDashed },
  pending: { variant: 'warning', Icon: Clock },
  approved: { variant: 'success', Icon: CheckCircle2 },
  rejected: { variant: 'destructive', Icon: XCircle },
} as const;

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
