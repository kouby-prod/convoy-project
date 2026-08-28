import { Appearance } from 'react-native';

/**
 * Design tokens mirroring the web app's brand theme (`apps/web/src/app/globals.css`,
 * Tailwind v4 `@theme` block) — vert/jaune per the CAN-VOITURAGE charte graphique.
 * Kept in sync by value, not by import: RN has no CSS variables, so these are
 * plain hex constants consumed by `StyleSheet.create` across the app.
 */
const lightColors = {
  primary: '#16a34a',
  primaryForeground: '#ffffff',
  secondary: '#15803d',
  secondaryForeground: '#ffffff',
  accent: '#facc15',
  accentForeground: '#111827',
  background: '#fafafa',
  foreground: '#0a0a0a',
  card: '#ffffff',
  cardForeground: '#0a0a0a',
  muted: '#f0fdf4',
  mutedForeground: '#166534',
  border: '#bbf7d0',
  input: '#dcfce7',
  ring: '#16a34a',
  // sRGB approximation of the web's oklch(0.55 0.2 27) — RN StyleSheet has no oklch() support.
  destructive: '#dc2626',
  destructiveForeground: '#ffffff',
} as const;

/** Same keys as `lightColors`, darkened following the same hue relationships as the web's `.dark` block in globals.css. */
const darkColors = {
  primary: '#22c55e',
  primaryForeground: '#052e16',
  secondary: '#4ade80',
  secondaryForeground: '#052e16',
  accent: '#facc15',
  accentForeground: '#1c1c1c',
  background: '#0f1512',
  foreground: '#f3f5f3',
  card: '#171d19',
  cardForeground: '#f3f5f3',
  muted: '#1c2420',
  mutedForeground: '#a8b2ab',
  border: '#2c3530',
  input: '#242a26',
  ring: '#22c55e',
  destructive: '#f87171',
  destructiveForeground: '#450a0a',
} as const;

/**
 * Resolved ONCE, synchronously, when this module first loads (i.e. at app
 * launch) from the phone's system appearance setting — every screen already
 * imports the plain `colors` object below, so this is what lets the whole
 * app follow system dark/light with zero changes anywhere else.
 *
 * There is deliberately no live in-app toggle: every screen's styles are
 * built once via a module-level `StyleSheet.create(...)` call using this
 * same object, so nothing left mounted would pick up a change anyway
 * without a full reload — see docs comment in ThemeProvider's absence here.
 * If a manual override is ever wanted, it needs each screen's styles moved
 * into the component body (a `useTheme()` hook + `useMemo`), not just a
 * change to this file.
 */
export const isDarkMode = Appearance.getColorScheme() === 'dark';

export const colors = isDarkMode ? darkColors : lightColors;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 14, full: 999 } as const;

export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24 } as const;
