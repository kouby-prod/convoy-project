'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/components/ui/theme-provider';
import { useTranslations } from 'next-intl';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
  { id: 'system', icon: Monitor },
] as const;

/** Light / dark / system. Mount-gated so the pressed option matches localStorage. */
export function AppearanceForm() {
  const t = useTranslations('Parametres.appearance');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">{t('description')}</p>
        <div role="radiogroup" aria-label={t('label')} className="grid grid-cols-3 gap-2">
          {OPTIONS.map(({ id, icon: Icon }) => {
            const selected = mounted && theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md px-2 py-3 text-sm font-medium outline-none transition-all duration-200',
                  'ring-1 ring-border hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30',
                  selected && 'bg-secondary text-secondary-foreground ring-transparent hover:bg-secondary/85',
                )}
              >
                <Icon className="size-4" strokeWidth={2.25} aria-hidden />
                {t(id)}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
