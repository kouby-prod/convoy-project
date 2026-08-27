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
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/** Compact passenger onboarding: account → search → first booking. */
export function BecomePassengerChecklist() {
  const t = useTranslations('BecomePassenger');
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const signedIn = !!session?.user;

  const bookingsQuery = useQuery({
    queryKey: ['me', 'bookings', 'onboarding'],
    enabled: signedIn,
    queryFn: async () => {
      const res = await api.me.bookings.$get({ query: { page: '1', limit: '1' } });
      if (!res.ok) throw new Error('Failed to load bookings');
      return res.json();
    },
  });

  const accountDone = signedIn;
  const searchDone = signedIn;
  const hasBooking = (bookingsQuery.data?.items.length ?? 0) > 0;
  const doneCount = [accountDone, searchDone, hasBooking].filter(Boolean).length;
  const sections = t.raw('sections') as LegalSection[];

  if (isSessionPending || (signedIn && bookingsQuery.isLoading)) {
    return <CardSkeleton rows={5} label={t('checklist.loading')} />;
  }

  return (
    <div className="grid gap-6">
      <p className="text-sm font-medium text-foreground" aria-live="polite">
        {t('checklist.progress', { done: doneCount, total: 3 })}
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
                <Link href={signInHref('/become-passenger')} className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'w-fit')}>
                  {t('checklist.account.signIn')}
                </Link>
                <Link href={signUpHref('/become-passenger')} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-fit')}>
                  {t('checklist.account.signUp')}
                </Link>
              </div>
            )
          }
        />
        <ChecklistStep
          index={2}
          title={t('checklist.search.title')}
          description={t('checklist.search.description')}
          done={searchDone}
          locked={!signedIn}
          href="/trajet"
          cta={t('checklist.search.cta')}
        />
        <ChecklistStep
          index={3}
          title={t('checklist.booking.title')}
          description={t('checklist.booking.description')}
          done={hasBooking}
          locked={!signedIn}
          href={hasBooking ? '/mes-reservations' : '/trajet'}
          cta={hasBooking ? t('checklist.booking.doneCta') : t('checklist.booking.cta')}
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
