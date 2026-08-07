import { z } from 'zod';

/**
 * Typed, validated client env. `NEXT_PUBLIC_*` vars are statically inlined by
 * Next at build time, so we must reference `process.env.NEXT_PUBLIC_API_URL`
 * by its full literal name (no dynamic access) for the value to be replaced.
 */
const EnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:3001'),
  /**
   * Optional WebSocket base for live message fan-out (e.g.
   * `ws://localhost:3001/ws/messages`). When unset, the messages UI falls
   * back to REST invalidation / light polling.
   */
  NEXT_PUBLIC_WS_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : undefined;
    }),
});

const parsed = EnvSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
});

if (!parsed.success) {
  throw new Error(`[env] Invalid web environment:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
