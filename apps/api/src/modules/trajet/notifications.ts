import { eq } from 'drizzle-orm';
import type { NotificationType } from '@carpool/schemas';
import { db } from '../../db/client';
import { notification } from '../../db/notification';
import { user } from '../../db/auth-schema';
import { sendEmail } from '../../auth/email';
import { env } from '../../env';
import { serializeNotification } from '../notification/serialize';
import { publishNotificationCreated } from '../notification/events';

/** The web app's own origin — first of TRUSTED_ORIGINS, which is where it runs. */
function webOrigin(): string {
  return env.TRUSTED_ORIGINS[0] ?? '';
}

export function trajetUrl(trajetId: string): string {
  return `${webOrigin()}/trajets/${trajetId}`;
}

export function trajetSearchUrl(): string {
  return `${webOrigin()}/trajets`;
}

/** Shared "from X to Y (departing ...)" fragment used by every notification below. */
export function describeTrip(trip: {
  departureCity: string;
  arrivalCity: string;
  departureAt: Date;
}): string {
  return `${trip.departureCity} to ${trip.arrivalCity} (departing ${trip.departureAt.toUTCString()})`;
}

/**
 * Looks up `userId`'s email, stores an in-app notification, publishes it for
 * live WebSocket fan-out, and sends a plain-text email. Storage/publish/email
 * failures are all logged, not thrown — there's no retry queue in this
 * codebase, so a dead SMTP server (or Redis) must never fail the booking
 * action that triggered the notification.
 */
export async function notifyUser(
  userId: string,
  subject: string,
  text: string,
  options: { type: NotificationType; link?: string | null },
): Promise<void> {
  const [recipient] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!recipient) return;

  let row: typeof notification.$inferSelect | undefined;
  try {
    [row] = await db
      .insert(notification)
      .values({
        userId,
        title: subject,
        body: text,
        channel: 'email',
        type: options.type,
        link: options.link ?? null,
      })
      .returning();
  } catch (err) {
    console.error(`Failed to store notification for ${recipient.email}`, err);
  }

  if (row) {
    try {
      await publishNotificationCreated(serializeNotification(row));
    } catch (err) {
      console.error(`Failed to publish notification event for ${recipient.email}`, err);
    }
  }

  try {
    await sendEmail({ to: recipient.email, subject, text });
  } catch (err) {
    console.error(`Failed to send "${subject}" notification to ${recipient.email}`, err);
  }
}
