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

/**
 * Same-origin relative path only. Rejects protocol-relative URLs, external
 * hosts, and loops back into auth pages. Strips a leading `/en` so next-intl
 * `Link` / `router.push` can add the locale prefix themselves.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (value.includes('://')) return null;
  const pathOnly = (value.split('#')[0] ?? value).split('?')[0] ?? value;
  if (pathOnly.includes('\\')) return null;

  let path = pathOnly;
  if (path === '/en') path = '/';
  else if (path.startsWith('/en/')) path = path.slice(3);

  if (path.startsWith('/auth/') || path === '/sign-in' || path === '/sign-up') return null;
  return path;
}

function withNextQuery(pathname: '/auth/signin' | '/auth/signup', next: string | null): string {
  const safe = safeNextPath(next);
  if (!safe) return pathname;
  return `${pathname}?next=${encodeURIComponent(safe)}`;
}

export function signInHref(next?: string | null): string {
  return withNextQuery('/auth/signin', next ?? null);
}

export function signUpHref(next?: string | null): string {
  return withNextQuery('/auth/signup', next ?? null);
}

function localePrefixedPath(locale: string, path: string): string {
  if (locale === 'en') return path === '/' ? '/en' : `/en${path}`;
  return path;
}

/** Absolute URL after a verified session (sign-in / Google). */
export function authReturnUrl(locale: string, next: string | null): string {
  const safe = safeNextPath(next);
  return `${window.location.origin}${localePrefixedPath(locale, safe ?? '/')}`;
}

/** Signup / resend land on the verified card, then Continue follows `next`. */
export function authVerifiedCallbackUrl(locale: string, next: string | null): string {
  const base = authCallbackUrl(locale, '/auth/verified');
  const safe = safeNextPath(next);
  if (!safe) return base;
  return `${base}?next=${encodeURIComponent(safe)}`;
}

export function authSignInErrorUrl(locale: string, next: string | null): string {
  const prefix = locale === 'en' ? '/en' : '';
  return `${window.location.origin}${prefix}${signInHref(next)}`;
}
