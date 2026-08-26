'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Same locale switch as the navbar, as a settings radio group. */
export function LanguageForm() {
  const t = useTranslations('Parametres.language');
  const translateLocale = useTranslations('LocaleSwitcher');
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
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">{t('description')}</p>
        <div role="radiogroup" aria-label={t('label')} className="grid grid-cols-2 gap-2">
          {routing.locales.map((localeOption) => {
            const selected = localeOption === locale;
            return (
              <button
                key={localeOption}
                type="button"
                lang={localeOption}
                role="radio"
                aria-checked={selected}
                disabled={isPending}
                onClick={() => switchToLocale(localeOption)}
                className={cn(
                  'rounded-md px-3 py-3 text-sm font-medium outline-none transition-all duration-200',
                  'ring-1 ring-border hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60',
                  selected && 'bg-secondary text-secondary-foreground ring-transparent hover:bg-secondary/85',
                )}
              >
                {translateLocale(localeOption)}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
