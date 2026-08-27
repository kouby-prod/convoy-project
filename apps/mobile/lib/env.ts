import { z } from 'zod';

/**
 * Typed, validated client env. `EXPO_PUBLIC_*` vars are inlined by Expo at
 * build time, so we reference the full literal name for the value to be
 * replaced.
 */
const EnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.url().default('http://localhost:3001'),
  // The web app's own origin — used to build the password-reset link mailed
  // to the driver, since the reset screen itself only exists on web today.
  EXPO_PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
  // Mirrors the web's NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY. Empty disables the
  // card checkout screen (same "leave empty to boot without a provider"
  // convention as the rest of the payment config) rather than failing env
  // validation, since it's optional in dev.
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().default(''),
});

const parsed = EnvSchema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL,
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
});

if (!parsed.success) {
  throw new Error(`[env] Invalid mobile environment:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
