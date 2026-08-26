'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.97 6.97 0 0 1 5.5 12c0-.72.12-1.42.34-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

/** Shown only when the API has Google OAuth credentials (public build flag). */
export function GoogleSignInButton() {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (!env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED) return null;

  async function handleClick() {
    setError('');
    setPending(true);
    const origin = window.location.origin;
    const callbackURL = locale === 'en' ? `${origin}/en` : `${origin}/`;
    const { error: socialError } = await authClient.signIn.social({
      provider: 'google',
      callbackURL,
      errorCallbackURL: `${origin}${locale === 'en' ? '/en' : ''}/auth/signin`,
    });
    if (socialError) {
      setPending(false);
      setError(socialError.message ?? t('errors.googleFailed'));
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t('or')}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full font-semibold"
        disabled={pending}
        onClick={() => void handleClick()}
      >
        <GoogleMark />
        {pending ? t('google.pending') : t('google.continue')}
      </Button>
      {error ? (
        <FormAlert className="rounded-md bg-destructive/10 px-4 py-3 ring-1 ring-destructive/20">
          {error}
        </FormAlert>
      ) : null}
    </div>
  );
}
