'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { authVerifiedCallbackUrl, safeNextPath, signInHref } from '@/lib/auth-urls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FormAlert } from '@/components/ui/form-alert';
import { PasswordInput } from '@/components/ui/password-input';
import { Checkbox } from '@/components/ui/checkbox';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { CheckEmailPanel } from '@/components/auth/check-email-panel';
import { useSessionDraft, clearSessionDraft } from '@/hooks/use-session-draft';

/**
 * Name/email/consent, not the passwords — see `useSessionDraft`. Clicking
 * "conditions générales d'utilisation" or "politique de confidentialité"
 * navigates away to /terms or /privacy and back, unmounting this form; the
 * draft is what survives that round trip (same fix as the locale switch).
 * Passwords are deliberately left out of the persisted draft — they're
 * short to retype and shouldn't sit in sessionStorage as plain text.
 */
interface SignUpDraft {
  firstName: string;
  lastName: string;
  email: string;
  acceptTerms: boolean;
}

const EMPTY_SIGNUP_DRAFT: SignUpDraft = {
  firstName: '',
  lastName: '',
  email: '',
  acceptTerms: false,
};

const SIGNUP_DRAFT_KEY = 'signup-draft';

export function SignUpForm() {
  const translateAuth = useTranslations('Auth');
  const translateBrand = useTranslations('Navbar');
  const translateA11y = useTranslations('A11y');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const [draft, setDraft] = useSessionDraft<SignUpDraft>(SIGNUP_DRAFT_KEY, EMPTY_SIGNUP_DRAFT);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  function updateDraft(patch: Partial<SignUpDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    const email = draft.email.trim();
    const password = formData.get('password')?.toString() ?? '';
    const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';
    const acceptedTerms = draft.acceptTerms;

    try {
      if (!firstName || !lastName || !email || !password || !confirmPassword) {
        setError(translateAuth('errors.missingFields'));
        return;
      }

      if (password !== confirmPassword) {
        setError(translateAuth('errors.passwordMismatch'));
        return;
      }

      if (!acceptedTerms) {
        setError(translateAuth('errors.termsRequired'));
        return;
      }

      const { error: signUpError } = await authClient.signUp.email({
        name: `${firstName} ${lastName}`,
        email,
        password,
        callbackURL: authVerifiedCallbackUrl(locale, nextPath),
      });

      if (signUpError) {
        setError(signUpError.message ?? translateAuth('errors.signUpFailed'));
        return;
      }

      clearSessionDraft(SIGNUP_DRAFT_KEY);
      setPendingEmail(email);
    } catch (err) {
      console.error(err);
      setError(translateAuth('errors.signUpUnavailable'));
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
          {waitingForInbox ? translateAuth('checkEmail.title') : translateAuth('signUp.title')}
        </CardTitle>
        <CardDescription>
          {waitingForInbox
            ? translateAuth('checkEmail.subtitle', { email: pendingEmail })
            : translateAuth('signUp.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-8 pb-8 pt-6">
        {waitingForInbox ? (
          <CheckEmailPanel email={pendingEmail} next={nextPath} />
        ) : (
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
                  value={draft.firstName}
                  onChange={(event) => updateDraft({ firstName: event.target.value })}
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
                  value={draft.lastName}
                  onChange={(event) => updateDraft({ lastName: event.target.value })}
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
                value={draft.email}
                onChange={(event) => updateDraft({ email: event.target.value })}
                required
              />
            </div>

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
              <p className="text-xs text-muted-foreground">{translateAuth('signUp.passwordHint')}</p>
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

            <Checkbox
              name="acceptTerms"
              checked={draft.acceptTerms}
              onChange={(event) => updateDraft({ acceptTerms: event.target.checked })}
              required
              className="items-start"
              label={translateAuth.rich('signUp.terms', {
                terms: (chunks) => (
                  <Link
                    href="/terms"
                    className="font-semibold text-primary hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link
                    href="/privacy"
                    className="font-semibold text-primary hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {chunks}
                  </Link>
                ),
              })}
            />

            {error ? (
              <FormAlert className="rounded-md bg-destructive/10 px-4 py-3 ring-1 ring-destructive/20">
                {error}
              </FormAlert>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
              {isLoading ? translateAuth('signUp.pending') : translateAuth('signUp.submit')}
            </Button>

            <GoogleSignInButton next={nextPath} />

            <p className="text-center text-sm text-muted-foreground">
              {translateAuth('signUp.hasAccount')}{' '}
              <Link href={signInHref(nextPath)} className="font-semibold text-primary hover:underline">
                {translateAuth('signUp.signIn')}
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
