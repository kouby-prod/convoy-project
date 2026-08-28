'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import type { LegalSection } from '@/components/legal/legal-page';
import { ChecklistStep } from '@/components/onboarding/checklist-step';
import { CardSkeleton } from '@/components/ui/list-skeleton';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { signInHref, signUpHref } from '@/lib/auth-urls';
import { fetchMyEligibility } from '@/lib/documents';
import { fetchMyVehicle } from '@/lib/vehicles';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/**
 * Live driver onboarding: account → licence number → vehicle → first published ride.
 * Guests only unlock step 1; the rest wait on a session.
 */
export function BecomeDriverChecklist() {
  const t = useTranslations('BecomeDriver');
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const signedIn = !!session?.user;

  const eligibilityQuery = useQuery({
    queryKey: ['my-eligibility'],
    queryFn: fetchMyEligibility,
    enabled: signedIn,
  });
  const vehicleQuery = useQuery({
    queryKey: ['my-vehicle'],
    queryFn: fetchMyVehicle,
    enabled: signedIn,
  });
  const trajetsQuery = useQuery({
    queryKey: ['me', 'trajets', 'onboarding'],
    enabled: signedIn,
    queryFn: async () => {
      const res = await api.me.trajets.$get({ query: { page: '1', limit: '1' } });
      if (!res.ok) throw new Error('Failed to load trajets');
      return res.json();
    },
  });

  const accountDone = signedIn;
  const documentsDone = !!eligibilityQuery.data?.licenseNumber;
  const vehicleDone = !!vehicleQuery.data;
  const publishDone = (trajetsQuery.data?.items.length ?? 0) > 0;
  const doneCount = [accountDone, documentsDone, vehicleDone, publishDone].filter(Boolean).length;
  const sections = t.raw('sections') as LegalSection[];

  if (isSessionPending || (signedIn && (eligibilityQuery.isLoading || vehicleQuery.isLoading || trajetsQuery.isLoading))) {
    return <CardSkeleton rows={6} label={t('checklist.loading')} />;
  }

  return (
    <div className="grid gap-6">
      <p className="text-sm font-medium text-foreground" aria-live="polite">
        {t('checklist.progress', { done: doneCount, total: 4 })}
      </p>

      <ol className="grid gap-3">
        <ChecklistStep
          index={1}
          title={t('checklist.account.title')}
          description={t('checklist.account.description')}
          done={accountDone}
          extra={
            accountDone ? null : (
              <div className="flex flex-wrap gap-2">
                <Link href={signInHref('/become-driver')} className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'w-fit')}>
                  {t('checklist.account.signIn')}
                </Link>
                <Link href={signUpHref('/become-driver')} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-fit')}>
                  {t('checklist.account.signUp')}
                </Link>
              </div>
            )
          }
        />
        <ChecklistStep
          index={2}
          title={t('checklist.documents.title')}
          description={t('checklist.documents.description')}
          done={documentsDone}
          locked={!signedIn}
          href="/mes-documents"
          cta={documentsDone ? t('checklist.documents.doneCta') : t('checklist.documents.cta')}
        />
        <ChecklistStep
          index={3}
          title={t('checklist.vehicle.title')}
          description={t('checklist.vehicle.description')}
          done={vehicleDone}
          locked={!signedIn}
          href="/trajet/nouveau"
          cta={vehicleDone ? t('checklist.vehicle.doneCta') : t('checklist.vehicle.cta')}
        />
        <ChecklistStep
          index={4}
          title={t('checklist.publish.title')}
          description={t('checklist.publish.description')}
          done={publishDone}
          locked={!signedIn}
          href={publishDone ? '/mes-trajets' : '/trajet/nouveau'}
          cta={publishDone ? t('checklist.publish.doneCta') : t('checklist.publish.cta')}
        />
      </ol>

      <details className="rounded-md p-4 ring-1 ring-border">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          {t('checklist.guide')}
        </summary>
        <div className="mt-4 grid gap-4">
          {sections.map((section) => (
            <div key={section.heading} className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">{section.heading}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{section.body}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
