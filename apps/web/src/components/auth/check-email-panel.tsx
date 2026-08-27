'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { authCallbackUrl } from '@/lib/auth-urls';
import { Button } from '@/components/ui/button';
import { FormAlert, FormStatus } from '@/components/ui/form-alert';

/**
 * Shared "check your inbox" body used after signup and after an unverified
 * sign-in. Resend hits BetterAuth with the same locale callback as signup.
 */
export function CheckEmailPanel({
  email,
  onUseDifferentEmail,
}: {
  email: string;
  onUseDifferentEmail?: () => void;
}) {
  const translateAuth = useTranslations('Auth');
  const locale = useLocale();
  const [resendState, setResendState] = useState<'idle' | 'pending' | 'sent' | 'error'>('idle');

  async function handleResend() {
    setResendState('pending');
    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: authCallbackUrl(locale, '/auth/verified'),
      });
      setResendState(error ? 'error' : 'sent');
    } catch (err) {
      console.error(err);
      setResendState('error');
    }
  }

  return (
    <div className="space-y-4">
      <FormStatus>{translateAuth('checkEmail.body')}</FormStatus>

      {resendState === 'sent' ? <FormStatus>{translateAuth('checkEmail.resent')}</FormStatus> : null}
      {resendState === 'error' ? (
        <FormAlert className="rounded-md bg-destructive/10 px-4 py-3 ring-1 ring-destructive/20">
          {translateAuth('checkEmail.resendFailed')}
        </FormAlert>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={resendState === 'pending'}
        onClick={() => void handleResend()}
      >
        {resendState === 'pending' ? translateAuth('checkEmail.resending') : translateAuth('checkEmail.resend')}
      </Button>

      {onUseDifferentEmail ? (
        <p className="text-center text-sm text-muted-foreground">
          <Button type="button" variant="link" className="h-auto p-0" onClick={onUseDifferentEmail}>
            {translateAuth('checkEmail.differentEmail')}
          </Button>
        </p>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/auth/signin" className="font-semibold text-primary hover:underline">
            {translateAuth('forgotPassword.backToSignIn')}
          </Link>
        </p>
      )}
    </div>
  );
}
