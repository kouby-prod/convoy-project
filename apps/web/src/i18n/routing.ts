import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // French is primary; English is secondary.
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  // Default locale (fr) has clean URLs (/about); others are prefixed (/en/about).
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
