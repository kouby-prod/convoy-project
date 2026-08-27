'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { FormAlert, FormStatus } from '@/components/ui/form-alert';
import { CardSkeleton } from '@/components/ui/list-skeleton';
import { cn } from '@/lib/utils';

export function VerifiedView() {
  const translateAuth = useTranslations('Auth');
  const translateBrand = useTranslations('Navbar');
  const searchParams = useSearchParams();
  const linkError = searchParams.get('error');
  const { data: session, isPending } = authClient.useSession();

  if (isPending && !linkError) {
    return <CardSkeleton className="mx-auto w-full max-w-lg" rows={3} label={translateAuth('verified.loading')} />;
  }

  const failed = Boolean(linkError);
  const confirmed = Boolean(session?.user?.emailVerified) && !failed;
  const errorCopy =
    linkError === 'TOKEN_EXPIRED' ? translateAuth('verified.expired') : translateAuth('verified.invalid');

  return (
    <Card className="mx-auto w-full max-w-lg gap-0 py-0 shadow-xl">
      <CardHeader className="gap-2 px-8 pt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{translateBrand('brand')}</p>
        <CardTitle className="font-display text-2xl font-semibold">
          {failed ? translateAuth('verified.errorTitle') : translateAuth('verified.title')}
        </CardTitle>
        <CardDescription>
          {failed ? translateAuth('verified.errorSubtitle') : translateAuth('verified.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-8 pb-8 pt-6">
        {failed ? (
          <>
            <FormAlert className="rounded-md bg-destructive/10 px-4 py-3 ring-1 ring-destructive/20">
              {errorCopy}
            </FormAlert>
            <Link href="/auth/signin" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}>
              {translateAuth('forgotPassword.backToSignIn')}
            </Link>
          </>
        ) : confirmed ? (
          <>
            <FormStatus>{translateAuth('verified.success')}</FormStatus>
            <Link href="/" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}>
              {translateAuth('verified.continue')}
            </Link>
          </>
        ) : (
          <>
            <FormAlert className="rounded-md bg-destructive/10 px-4 py-3 ring-1 ring-destructive/20">
              {translateAuth('verified.missing')}
            </FormAlert>
            <Link href="/auth/signin" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'w-full')}>
              {translateAuth('forgotPassword.backToSignIn')}
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
