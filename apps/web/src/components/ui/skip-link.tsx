'use client';

import { useTranslations } from 'next-intl';

/** First focusable control — jumps keyboard users past sticky chrome. */
export function SkipLink() {
  const t = useTranslations('A11y');

  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:outline-none focus:ring-3 focus:ring-ring/30"
    >
      {t('skipToContent')}
    </a>
  );
}
