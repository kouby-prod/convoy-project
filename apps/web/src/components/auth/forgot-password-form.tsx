'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { authCallbackUrl } from '@/lib/auth-urls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FormAlert, FormStatus } from '@/components/ui/form-alert';

function resetCallbackUrl(locale: string) {
  return authCallbackUrl(locale, '/auth/reset-password');
}

export function ForgotPasswordForm() {
  const translateAuth = useTranslations('Auth');
  const translateBrand = useTranslations('Navbar');
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email')?.toString().trim() ?? '';

    try {
      if (!email) {
        setError(translateAuth('errors.missingFields'));
        return;
      }

      const { error: resetError } = await authClient.requestPasswordReset({
        email,
        redirectTo: resetCallbackUrl(locale),
      });

      if (resetError) {
        setError(resetError.message ?? translateAuth('errors.resetFailed'));
        return;
      }

      setSent(true);
    } catch (err) {
      console.error(err);
      setError(translateAuth('errors.resetFailed'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-lg gap-0 py-0 shadow-xl">
      <CardHeader className="gap-2 px-8 pt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{translateBrand('brand')}</p>
        <CardTitle className="font-display text-2xl font-semibold">
          {translateAuth('forgotPassword.title')}
        </CardTitle>
        <CardDescription>{translateAuth('forgotPassword.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="px-8 pb-8 pt-6">
        {sent ? (
          <div className="space-y-4">
            <FormStatus>{translateAuth('forgotPassword.sent')}</FormStatus>
            <Link href="/auth/signin" className="inline-block text-sm font-semibold text-primary hover:underline">
              {translateAuth('forgotPassword.backToSignIn')}
            </Link>
          </div>
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

            {error ? (
              <FormAlert className="rounded-md bg-destructive/10 px-4 py-3 ring-1 ring-destructive/20">
                {error}
              </FormAlert>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
              {isLoading ? translateAuth('forgotPassword.pending') : translateAuth('forgotPassword.submit')}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/auth/signin" className="font-semibold text-primary hover:underline">
                {translateAuth('forgotPassword.backToSignIn')}
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
