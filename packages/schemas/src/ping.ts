import { z } from 'zod';

/**
 * The canonical "contract spine" of the skeleton.
 *
 * This schema is defined ONCE here and flows through the entire stack:
 *   packages/schemas (here)
 *     -> apps/api        (validated + served at GET /ping)
 *     -> packages/api-client (typed via Hono RPC)
 *     -> apps/web + apps/mobile (rendered)
 *
 * Changing the shape below must produce type errors everywhere it is consumed
 * until each consumer is updated. That is the point of the skeleton.
 */
export const PingResponseSchema = z
  .object({
    message: z.string(),
    timestamp: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('PingResponse');

export type PingResponse = z.infer<typeof PingResponseSchema>;
