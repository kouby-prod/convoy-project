/**
 * Web return URLs passed to BetterAuth as `callbackURL` / `redirectTo`.
 * French is unprefixed (`localePrefix: 'as-needed'`).
 */
export function authCallbackUrl(locale: string, path: '/auth/verified' | '/auth/reset-password'): string {
  const prefix = locale === 'fr' ? '' : `/${locale}`;
  return `${window.location.origin}${prefix}${path}`;
}

/** Locale home. Used as the sign-in callback so a verified session is not sent to /auth/verified. */
export function authHomeUrl(locale: string): string {
  const origin = window.location.origin;
  return locale === 'en' ? `${origin}/en` : `${origin}/`;
}
