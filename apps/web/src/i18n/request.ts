import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

// Provides the active locale + its messages to Server Components per request.
export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Pin the formatting time zone. Without it, dates render in the server's
    // zone (UTC in Docker) but the browser's zone after hydration — departure
    // times would shift between the ride list and the ride detail page.
    timeZone: 'Europe/Paris',
  };
});
