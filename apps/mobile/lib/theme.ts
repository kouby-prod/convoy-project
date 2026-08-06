/**
 * Design tokens mirroring the web app's brand theme (`apps/web/src/app/globals.css`,
 * Tailwind v4 `@theme` block) — vert/jaune per the CAN-VOITURAGE charte graphique.
 * Kept in sync by value, not by import: RN has no CSS variables, so these are
 * plain hex constants consumed by `StyleSheet.create` across the app.
 */
export const colors = {
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

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 14, full: 999 } as const;

export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24 } as const;
