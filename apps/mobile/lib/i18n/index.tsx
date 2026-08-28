import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { fr } from './messages/fr';
import { en } from './messages/en';

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: Locale = 'fr';
const LOCALE_STORAGE_KEY = 'app-locale';

const catalogs: Record<Locale, typeof fr> = { fr, en };

/** Recursively derives every dot-path to a string leaf in the message catalog, e.g. `'compte.profileTitle'`. */
type Path<T, Prefix extends string = ''> = T extends string
  ? Prefix extends ''
    ? never
    : Prefix
  : {
      [K in keyof T & string]: Path<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>;
    }[keyof T & string];

export type MessageKey = Path<typeof fr>;

function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value === 'fr' || value === 'en';
}

function detectDeviceLocale(): Locale {
  const deviceLanguage = Localization.getLocales()[0]?.languageCode;
  return deviceLanguage === 'en' ? 'en' : DEFAULT_LOCALE;
}

function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Resolves the active locale from a persisted preference (`expo-secure-store`,
 * fire-and-forget async on mount) falling back to the device's own language —
 * unlike `lib/theme.ts`'s dark mode, this must be reactive: switching languages
 * has to re-render every mounted `t()` call immediately, so it lives in a
 * React context instead of being resolved once at module load.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectDeviceLocale);

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(LOCALE_STORAGE_KEY).then((stored) => {
      if (!cancelled && isSupportedLocale(stored)) setLocaleState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void SecureStore.setItemAsync(LOCALE_STORAGE_KEY, next);
  }, []);

  const t = useCallback<TFunction>(
    (key, params) => {
      const template = getByPath(catalogs[locale], key) ?? getByPath(catalogs[DEFAULT_LOCALE], key);
      return interpolate(typeof template === 'string' ? template : key, params);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
