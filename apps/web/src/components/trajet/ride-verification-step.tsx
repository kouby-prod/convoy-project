'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { BadgeCheck } from 'lucide-react';
import {
  deriveDriverVerification,
  permisFreshUntil,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
} from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { VerificationBanner } from '@/components/documents/verification-banner';
import { EligibilityPanel } from '@/components/documents/eligibility-panel';
import { DocumentSlotCard } from '@/components/mes-documents/document-slot-card';
import { toLatestByType } from '@/components/mes-documents/mes-documents-panel';
import { fetchMyDocuments, fetchMyEligibility } from '@/lib/documents';

/**
 * The "permis vérifié" half of Étape 2. Reads the SAME `/documents/me` and
 * `/eligibility` data (same query keys) as `/mes-documents`, so a driver who
 * already verified once never sees this ask again here — only the "valid
 * until" confirmation — and if a licence goes past its one-year window
 * (`deriveDriverVerification`), this and `/mes-documents` agree about it,
 * since both derive from the same shared rollup.
 */
export function RideVerificationStep() {
  const t = useTranslations('Trajet');
  const format = useFormatter();

  const documentsQuery = useQuery({ queryKey: ['my-documents'], queryFn: fetchMyDocuments });
  const eligibilityQuery = useQuery({ queryKey: ['my-eligibility'], queryFn: fetchMyEligibility });

  if (documentsQuery.isLoading || eligibilityQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{t('create.step2.verification.loading')}</p>;
  }
  if (documentsQuery.isError || eligibilityQuery.isError) {
    return <p className="text-sm text-destructive">{t('create.step2.verification.loadError')}</p>;
  }

  const documents = documentsQuery.data ?? [];
  const latestByType = toLatestByType(documents);
  const verification = deriveDriverVerification(documents, {
    dateOfBirth: eligibilityQuery.data?.dateOfBirth ?? null,
  });

  if (verification.status === 'approved') {
    const freshUntil = permisFreshUntil(latestByType.get('permis')?.reviewedAt ?? null);
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-5 pt-5">
          <BadgeCheck className="size-6 shrink-0 text-success" strokeWidth={2} aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {t('create.step2.verification.alreadyVerifiedTitle')}
            </p>
            <p className="text-sm text-muted-foreground">
              {freshUntil
                ? t('create.step2.verification.alreadyVerifiedBody', {
                    date: format.dateTime(new Date(freshUntil), {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }),
                  })
                : t('create.step2.verification.alreadyVerifiedBodyNoDate')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const slotStatusByType = new Map(verification.slots.map((slot) => [slot.type, slot.status]));

  return (
    <div className="flex flex-col gap-5">
      <VerificationBanner verification={verification} />
      <EligibilityPanel verification={verification} />
      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {REQUIRED_DRIVER_DOCUMENT_TYPES.map((type) => (
          <DocumentSlotCard
            key={type}
            type={type}
            latest={latestByType.get(type) ?? null}
            slotStatus={slotStatusByType.get(type) ?? 'missing'}
          />
        ))}
      </div>
    </div>
  );
}
