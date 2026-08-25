'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FormAlert, FormStatus } from '@/components/ui/form-alert';
import { PasswordInput } from '@/components/ui/password-input';

export function ResetPasswordForm() {
  const translateAuth = useTranslations('Auth');
  const translateBrand = useTranslations('Navbar');
  const translateA11y = useTranslations('A11y');
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const linkError = searchParams.get('error');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const invalidLink = !token || linkError === 'INVALID_TOKEN';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setError('');
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const password = formData.get('password')?.toString() ?? '';
    const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

    try {
      if (!password || !confirmPassword) {
        setError(translateAuth('errors.missingFields'));
        return;
      }
      if (password !== confirmPassword) {
        setError(translateAuth('errors.passwordMismatch'));
        return;
      }

      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (resetError) {
        setError(resetError.message ?? translateAuth('errors.resetUnavailable'));
        return;
      }

      setDone(true);
    } catch (err) {
      console.error(err);
      setError(translateAuth('errors.resetUnavailable'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-lg gap-0 py-0 shadow-xl">
      <CardHeader className="gap-2 px-8 pt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{translateBrand('brand')}</p>
        <CardTitle className="font-display text-2xl font-semibold">
          {translateAuth('resetPassword.title')}
        </CardTitle>
        <CardDescription>{translateAuth('resetPassword.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="px-8 pb-8 pt-6">
        {done ? (
          <div className="space-y-4">
            <FormStatus>{translateAuth('resetPassword.success')}</FormStatus>
            <Link href="/auth/signin" className="inline-block text-sm font-semibold text-primary hover:underline">
              {translateAuth('forgotPassword.backToSignIn')}
            </Link>
          </div>
        ) : invalidLink ? (
          <div className="space-y-4">
            <FormAlert className="rounded-md bg-destructive/10 px-4 py-3 ring-1 ring-destructive/20">
              {linkError === 'INVALID_TOKEN'
                ? translateAuth('resetPassword.invalidToken')
                : translateAuth('resetPassword.missingToken')}
            </FormAlert>
            <Link href="/auth/forgot-password" className="inline-block text-sm font-semibold text-primary hover:underline">
              {translateAuth('signIn.forgotPassword')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{translateAuth('fields.password')}</Label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                placeholder={translateAuth('fields.passwordPlaceholder')}
                minLength={8}
                required
                showLabel={translateA11y('showPassword')}
                hideLabel={translateA11y('hidePassword')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{translateAuth('fields.confirmPassword')}</Label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                placeholder={translateAuth('fields.confirmPasswordPlaceholder')}
                minLength={8}
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
              {isLoading ? translateAuth('resetPassword.pending') : translateAuth('resetPassword.submit')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
