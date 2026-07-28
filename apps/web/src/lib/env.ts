import { z } from 'zod';

/**
 * Typed, validated client env. `NEXT_PUBLIC_*` vars are statically inlined by
 * Next at build time, so we must reference `process.env.NEXT_PUBLIC_API_URL`
 * by its full literal name (no dynamic access) for the value to be replaced.
 */
const EnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:3001'),
  /**
   * Base URL used by server components. Not `NEXT_PUBLIC_`, so it is never
   * inlined into the browser bundle — it reads as undefined there and falls
   * back to the public URL, which is what the browser should use anyway.
   *
   * In Docker the two differ: the browser reaches the API on localhost, while
   * the web container must address it by service name.
   */
  INTERNAL_API_URL: z.url().default('http://localhost:3001'),
});

const parsed = EnvSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  INTERNAL_API_URL: process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL,
});

if (!parsed.success) {
  throw new Error(`[env] Invalid web environment:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
