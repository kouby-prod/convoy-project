import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16 "proxy" convention (formerly middleware).
// Detects the locale (cookie → Accept-Language → default fr) and handles
// the clean-vs-prefixed routing defined in routing.ts.
export default createMiddleware(routing);

export const config = {
  // Run on everything except API routes, Next internals, and static files.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
