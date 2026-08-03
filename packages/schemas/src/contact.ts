import { z } from 'zod';

/**
 * Payload for `POST /contact` — the public support/contact form. Not tied
 * to a signed-in session: `name`/`email` are supplied by the caller (the
 * web app prefills them from the session when one exists) since the whole
 * point is to also work for anonymous visitors.
 */
export const CreateContactMessageSchema = z
  .object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
  })
  .describe('CreateContactMessage');
export type CreateContactMessage = z.infer<typeof CreateContactMessageSchema>;

export const ContactMessageSentSchema = z.object({ success: z.literal(true) }).describe('ContactMessageSent');
export type ContactMessageSent = z.infer<typeof ContactMessageSentSchema>;
