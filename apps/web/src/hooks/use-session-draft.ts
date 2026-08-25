'use client';

import { useEffect, useState } from 'react';

/**
 * `useState`, except the value survives a component remount by round-tripping
 * through `sessionStorage`.
 *
 * Why this is needed at all: switching the site language changes the
 * `[locale]` segment of the URL (`LocaleSwitcher` calls
 * `router.replace(pathname, { locale })`), which is a real navigation — Next
 * re-renders the whole `app/[locale]/...` route tree from that segment down,
 * unmounting and remounting every client component under it. Any plain
 * `useState` in a form on that tree (ride details, vehicle description, …) is
 * lost. This hook is the fix: the value is written to `sessionStorage` on
 * every change and read back on mount, so a locale switch — or a stray
 * back/forward navigation, or an accidental refresh — no longer wipes out
 * what the driver already typed.
 *
 * `sessionStorage`, not `localStorage`: a form draft is scoped to the current
 * tab/session, not something that should reappear days later in a new one.
 *
 * SSR-safe by construction: the very first render (server AND client, before
 * hydration) always uses `initialValue` — `sessionStorage` doesn't exist on
 * the server, and reading it synchronously on the client's first render would
 * make that render disagree with the server-rendered HTML. The stored value
 * (if any) is applied a moment later via `useEffect`, which only runs in the
 * browser. The one-render flash this costs on a hard page load is invisible
 * in practice; the locale-switch case this exists for is a pure client-side
 * remount with nothing server-rendered to flash against.
 */
export function useSessionDraft<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  // Rehydrate once on mount. Deliberately NOT reacting to `initialValue`
  // changing — it is only ever a literal/constant at each call site, and
  // treating it as reactive would re-run this every render.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {
      // Corrupt JSON, or storage unavailable (private browsing, disabled) —
      // fall back to `initialValue`, already the current state.
    }
    setHydrated(true);
  }, [key]);

  // Persist every change, but only after the read above has landed — writing
  // `initialValue` here first would clobber a real stored draft before it's
  // even been read.
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable — the draft just won't persist this time.
    }
  }, [key, value, hydrated]);

  return [value, setValue] as const;
}

/** Remove a persisted draft — call once the form it belongs to has succeeded, so a stale draft doesn't reappear next time. */
export function clearSessionDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage isn't available.
  }
}
