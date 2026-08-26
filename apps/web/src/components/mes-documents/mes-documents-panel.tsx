'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import {
  deriveDriverVerification,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  type DriverDocument,
  type RequiredDriverDocumentType,
} from '@carpool/schemas';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { VerificationBanner } from '@/components/documents/verification-banner';
import { EligibilityPanel } from '@/components/documents/eligibility-panel';
import { DriverIdentityCard } from '@/components/documents/driver-identity-card';
import { fetchMyDocuments, fetchMyEligibility } from '@/lib/documents';
import { DocumentSlotCard } from './document-slot-card';
import { MesDocumentsHistory } from './mes-documents-list';

/**
 * `/mes-documents` behind a session.
 *
 * Every route this page uses is authenticated, so without a session the requests
 * could only ever 401 — prompting for sign-in is more honest than rendering a
 * form that is guaranteed to fail.
 *
 * The document list is fetched once here and handed down, so the banner, the two
 * slots and the history are three readings of a single response rather than
 * three requests that could disagree mid-flight.
 */
export function MesDocumentsPanel() {
  const t = useTranslations('Documents');
  const { data: session, isPending } = authClient.useSession();

  // Two queries because they are two resources, but one loading gate: the
  // verdict below is derived from BOTH, and rendering "incomplete" while the
  // birth date is still in flight would flash a wrong answer.
  const documentsQuery = useQuery({
    queryKey: ['my-documents'],
    queryFn: fetchMyDocuments,
    enabled: Boolean(session?.user),
  });
  const eligibilityQuery = useQuery({
    queryKey: ['my-eligibility'],
    queryFn: fetchMyEligibility,
    enabled: Boolean(session?.user),
  });

  // Render nothing until the session resolves, to avoid flashing the sign-in
  // prompt at someone who is in fact signed in.
  if (isPending) return null;

  if (!session?.user) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 pt-8 text-center">
          <ShieldCheck className="size-8 text-primary" strokeWidth={2} aria-hidden />
          <p className="text-sm text-muted-foreground">{t('authRequired')}</p>
          <Link href="/sign-in" className={buttonVariants({ variant: 'primary' })}>
            {t('authCta')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (documentsQuery.isLoading || eligibilityQuery.isLoading) {
    return <StatusCard>{t('loading')}</StatusCard>;
  }
  if (documentsQuery.isError || eligibilityQuery.isError) {
    return <StatusCard tone="error">{t('error')}</StatusCard>;
  }

  const documents = documentsQuery.data ?? [];
  const latestByType = toLatestByType(documents);
  const verification = deriveDriverVerification(documents, {
    dateOfBirth: eligibilityQuery.data?.dateOfBirth ?? null,
  });
  const slotStatusByType = new Map(verification.slots.map((slot) => [slot.type, slot.status]));

  return (
    <div className="flex flex-col gap-6">
      <VerificationBanner verification={verification} />

      <DriverIdentityCard />

      <EligibilityPanel verification={verification} />

      {/* The required document(s) — today, just the licence — side by side, the
          whole ask visible at once rather than one form to submit repeatedly.

          `items-start` matters: grid items stretch to the tallest row by
          default, so a collapsed card next to an open one grew a large empty
          panel under its button. Each card should end where its content does. */}
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

      <MesDocumentsHistory documents={documents} />
    </div>
  );
}

function StatusCard({ children, tone }: { children: string; tone?: 'error' }) {
  return (
    <Card>
      <CardContent
        className={
          tone === 'error'
            ? 'p-8 pt-8 text-center text-sm text-destructive'
            : 'p-8 pt-8 text-center text-sm text-muted-foreground'
        }
      >
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Newest submission per required type. The API returns newest first, so the
 * first row seen for a type wins and the older ones are skipped — the same rule
 * `deriveDriverVerification` applies, which is why the badge on a slot always
 * matches the banner above it.
 */
export function toLatestByType(
  documents: DriverDocument[],
): Map<RequiredDriverDocumentType, DriverDocument> {
  const latest = new Map<RequiredDriverDocumentType, DriverDocument>();
  for (const document of documents) {
    const type = REQUIRED_DRIVER_DOCUMENT_TYPES.find((required) => required === document.type);
    if (type && !latest.has(type)) latest.set(type, document);
  }
  return latest;
}
