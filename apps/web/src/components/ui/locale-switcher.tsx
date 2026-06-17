'use client';

import { Fragment, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Plain "FR | EN" language toggle (no icon). Switches the active locale while
 * keeping the user on the same page — next-intl rewrites the path for the
 * target locale (clean URL for fr, /en prefix for en).
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const translateLocaleSwitcher = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchToLocale(targetLocale: Locale) {
    if (targetLocale === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: targetLocale });
    });
  }

  return (
    <div
      role="group"
      aria-label={translateLocaleSwitcher('label')}
      className={cn('inline-flex items-center gap-1.5 text-sm', className)}
    >
      {routing.locales.map((localeOption, index) => {
        const isActive = localeOption === locale;
        return (
          <Fragment key={localeOption}>
            {index > 0 && <span aria-hidden className="select-none text-current/40">|</span>}
            <button
              type="button"
              lang={localeOption}
              disabled={isPending}
              aria-pressed={isActive}
              onClick={() => switchToLocale(localeOption)}
              className={cn(
                'rounded-md px-1 font-semibold uppercase outline-none transition-all duration-200 focus-visible:ring-3 focus-visible:ring-current/30 disabled:opacity-60',
                isActive ? 'text-current' : 'text-current/60 hover:text-current',
              )}
            >
              {localeOption}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
