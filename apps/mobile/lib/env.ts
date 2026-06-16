import { z } from 'zod';

/**
 * Typed, validated client env. `EXPO_PUBLIC_*` vars are inlined by Expo at
 * build time, so we reference the full literal name for the value to be
 * replaced.
 */
const EnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.url().default('http://localhost:3001'),
});

const parsed = EnvSchema.safeParse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
});

if (!parsed.success) {
  throw new Error(`[env] Invalid mobile environment:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
