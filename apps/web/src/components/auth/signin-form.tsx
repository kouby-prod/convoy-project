'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { authHomeUrl } from '@/lib/auth-urls';
import { isEmailNotVerified } from '@/lib/auth-errors';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FormAlert } from '@/components/ui/form-alert';
import { PasswordInput } from '@/components/ui/password-input';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { CheckEmailPanel } from '@/components/auth/check-email-panel';

export function SignInForm() {
  const translateAuth = useTranslations('Auth');
  const translateBrand = useTranslations('Navbar');
  const translateA11y = useTranslations('A11y');
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email')?.toString().trim() ?? '';
    const password = formData.get('password')?.toString() ?? '';

    try {
      if (!email || !password) {
        setError(translateAuth('errors.missingCredentials'));
        return;
      }

      const callbackURL = authHomeUrl(locale);
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
        callbackURL,
      });

      if (signInError) {
        if (isEmailNotVerified(signInError)) {
          setPendingEmail(email);
          return;
        }
        setError(signInError.message ?? translateAuth('errors.signInFailed'));
        return;
      }

      router.push('/');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(translateAuth('errors.signInUnavailable'));
    } finally {
      setIsLoading(false);
    }
  }

  const waitingForInbox = pendingEmail.length > 0;

  return (
    <Card className="mx-auto w-full max-w-lg gap-0 py-0 shadow-xl">
      <CardHeader className="gap-2 px-8 pt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{translateBrand('brand')}</p>
        <CardTitle className="font-display text-2xl font-semibold">
          {waitingForInbox ? translateAuth('checkEmail.title') : translateAuth('signIn.title')}
        </CardTitle>
        <CardDescription>
          {waitingForInbox
            ? translateAuth('checkEmail.subtitle', { email: pendingEmail })
            : translateAuth('signIn.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-8 pb-8 pt-6">
        {waitingForInbox ? (
          <CheckEmailPanel email={pendingEmail} onUseDifferentEmail={() => setPendingEmail('')} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{translateAuth('fields.email')}</Label>
              <Input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder={translateAuth('fields.emailPlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">{translateAuth('fields.password')}</Label>
                <Link href="/auth/forgot-password" className="text-xs font-semibold text-primary hover:underline">
                  {translateAuth('signIn.forgotPassword')}
                </Link>
              </div>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                placeholder={translateAuth('fields.passwordPlaceholder')}
                required
                showLabel={translateA11y('showPassword')}
                hideLabel={translateA11y('hidePassword')}
              />
            </div>

            {error ? (
              <FormAlert className="rounded-md bg-destructive/10 px-4 py-3 ring-1 ring-destructive/20">
                {error}
              </FormAlert>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
              {isLoading ? translateAuth('signIn.pending') : translateAuth('signIn.submit')}
            </Button>

            <GoogleSignInButton />

            <p className="text-center text-sm text-muted-foreground">
              {translateAuth('signIn.noAccount')}{' '}
              <Link href="/auth/signup" className="font-semibold text-primary hover:underline">
                {translateAuth('signIn.createAccount')}
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
