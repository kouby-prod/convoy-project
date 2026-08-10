'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function SignUpForm() {
  const translateAuth = useTranslations('Auth');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const firstName = formData.get('firstname')?.toString().trim() ?? '';
    const lastName = formData.get('lastname')?.toString().trim() ?? '';
    const email = formData.get('email')?.toString().trim() ?? '';
    const password = formData.get('password')?.toString() ?? '';
    const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

    try {
      if (!firstName || !lastName || !email || !password || !confirmPassword) {
        setError(translateAuth('errors.missingFields'));
        return;
      }

      if (password !== confirmPassword) {
        setError(translateAuth('errors.passwordMismatch'));
        return;
      }

      const { error: signUpError } = await authClient.signUp.email({
        name: `${firstName} ${lastName}`,
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message ?? translateAuth('errors.signUpFailed'));
        return;
      }

      router.push('/');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(translateAuth('errors.signUpUnavailable'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-lg gap-0 py-0 shadow-xl">
      <CardHeader className="gap-2 px-8 pt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Convoy</p>
        <CardTitle className="font-display text-2xl font-semibold">
          {translateAuth('signUp.title')}
        </CardTitle>
        <CardDescription>{translateAuth('signUp.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="px-8 pb-8 pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstname">{translateAuth('fields.firstName')}</Label>
              <Input
                id="firstname"
                type="text"
                name="firstname"
                autoComplete="given-name"
                placeholder={translateAuth('fields.firstNamePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastname">{translateAuth('fields.lastName')}</Label>
              <Input
                id="lastname"
                type="text"
                name="lastname"
                autoComplete="family-name"
                placeholder={translateAuth('fields.lastNamePlaceholder')}
                required
              />
            </div>
          </div>

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
              autoComplete="new-password"
              placeholder={translateAuth('fields.passwordPlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{translateAuth('fields.confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              placeholder={translateAuth('fields.confirmPasswordPlaceholder')}
              required
            />
          </div>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/20">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? translateAuth('signUp.pending') : translateAuth('signUp.submit')}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {translateAuth('signUp.hasAccount')}{' '}
            <Link href="/auth/signin" className="font-semibold text-primary hover:underline">
              {translateAuth('signUp.signIn')}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
