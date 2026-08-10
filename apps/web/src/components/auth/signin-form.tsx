'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function SignInForm() {
  const translateAuth = useTranslations('Auth');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
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

      const { error: signInError } = await authClient.signIn.email({ email, password });

      if (signInError) {
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

  return (
    <Card className="mx-auto w-full max-w-lg gap-0 py-0 shadow-xl">
      <CardHeader className="gap-2 px-8 pt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Convoy</p>
        <CardTitle className="font-display text-2xl font-semibold">
          {translateAuth('signIn.title')}
        </CardTitle>
        <CardDescription>{translateAuth('signIn.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="px-8 pb-8 pt-6">
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
            <Label htmlFor="password">{translateAuth('fields.password')}</Label>
            <Input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder={translateAuth('fields.passwordPlaceholder')}
              required
            />
          </div>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/20">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? translateAuth('signIn.pending') : translateAuth('signIn.submit')}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {translateAuth('signIn.noAccount')}{' '}
            <Link href="/auth/signup" className="font-semibold text-primary hover:underline">
              {translateAuth('signIn.createAccount')}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
