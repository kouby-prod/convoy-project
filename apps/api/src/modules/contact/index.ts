import { OpenAPIHono } from '@hono/zod-openapi';
import type { AuthEnv } from '../../auth';
import { rateLimit } from '../../middleware/rate-limit';
import { sendEmail } from '../../auth/email';
import { env } from '../../env';
import { createContactMessageRoute } from './contact.routes';

/**
 * Contact module — an `OpenAPIHono` sub-app mounted by app.ts (see
 * apps/api/src/modules/README.md). It is exported as the CHAINED result of
 * `.openapi(...)` so its route types flow into `AppType` (the RPC client and
 * Swagger). Exporting the bare `new OpenAPIHono()` would drop the route types
 * and `api.contact` would not exist on the typed client.
 *
 * No table: a contact message is forwarded to the support inbox and not
 * persisted — there is nothing here to list or look up later.
 */
const app = new OpenAPIHono<AuthEnv>();

// Public and unauthenticated, so a real IP-based cap matters here more than
// almost anywhere else in the API — otherwise this is a free spam relay.
const contactRateLimit = rateLimit<AuthEnv>({ windowSeconds: 60 * 60, max: 5 });
app.use('/contact', contactRateLimit);

export const contactModule = app.openapi(createContactMessageRoute, async (c) => {
  const { name, email, subject, message } = c.req.valid('json');

  try {
    await sendEmail({
      to: env.SUPPORT_EMAIL ?? env.EMAIL_FROM,
      subject: `[Contact] ${subject}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    });
  } catch (err) {
    // Unlike the trajet module's best-effort notifyUser, email IS the
    // feature here — a caller whose message silently vanished has no other
    // way to reach support, so a delivery failure must be reported, not
    // swallowed.
    console.error('Failed to forward contact message', err);
    return c.json({ error: 'Failed to send your message. Please try again later.' }, 502);
  }

  return c.json({ success: true as const }, 200);
});
