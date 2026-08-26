import { eq, inArray } from 'drizzle-orm';
import type { NotificationType } from '@carpool/schemas';
import { db } from '../../db/client';
import { notification, notificationPreference, webPushSubscription } from '../../db/notification';
import { user } from '../../db/auth-schema';
import { sendEmail, type EmailAttachment } from '../../auth/email';
import { sendWebPush } from '../notification/push';
import { env } from '../../env';
import { serializeNotification } from '../notification/serialize';
import { publishNotificationCreated } from '../notification/events';

/** The web app's own origin — first of TRUSTED_ORIGINS, which is where it runs. */
function webOrigin(): string {
  return env.TRUSTED_ORIGINS[0] ?? '';
}

/** The trajet detail page is `/trajet/:id` (singular) — `/trajets/:id` (plural) does not exist. */
export function trajetUrl(trajetId: string): string {
  return `${webOrigin()}/trajet/${trajetId}`;
}

/** Human-readable due instant for emails (Eastern, English). */
export function formatDueAt(dueAt: Date | string): string {
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  return date.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function trajetSearchUrl(): string {
  return `${webOrigin()}/trajets`;
}

export function paymentUrl(bookingId: string): string {
  return `${webOrigin()}/paiement/${bookingId}`;
}

/** The booking's chat thread — where a "new message" notification should land. */
export function messagesUrl(bookingId: string): string {
  return `${webOrigin()}/messages/${bookingId}`;
}

/** Shared "from X to Y (departing ...)" fragment used by the emailed version of every notification below. */
export function describeTrip(trip: {
  departureCity: string;
  arrivalCity: string;
  departureAt: Date;
}): string {
  return `${trip.departureCity} to ${trip.arrivalCity} (departing ${trip.departureAt.toUTCString()})`;
}

/**
 * Short "City → City (Aug 11, 4:10 PM)" fragment for the in-app notification
 * body — unlike {@link describeTrip} (used for the standalone email, which
 * needs the full picture), the app already shows the notification's own
 * relative time and a "View" link, so this stays terse and skips the
 * technical GMT/UTC timestamp.
 */
export function describeTripShort(trip: {
  departureCity: string;
  arrivalCity: string;
  departureAt: Date;
}): string {
  const shortDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(trip.departureAt);
  return `${trip.departureCity} → ${trip.arrivalCity} (${shortDate})`;
}

/** Truncates a quoted message preview so the in-app notification stays scannable. */
export function truncateForPreview(text: string, maxLength = 80): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

export type NotifyUserOptions = {
  type: NotificationType;
  link?: string | null;
  inAppBody?: string;
  attachments?: EmailAttachment[];
};

/**
 * Looks up `userId`'s email, stores an in-app notification, publishes it for
 * live WebSocket fan-out, sends a plain-text email, and pushes to every
 * subscribed browser. Channel switches in `notification_preference` skip
 * insert/WS, email and/or push independently (missing row = every channel
 * on). Storage/publish/email/push failures are all logged, not thrown —
 * there's no retry queue in this codebase, so a dead SMTP server, Redis, or
 * push service must never fail the booking action that triggered the
 * notification.
 *
 * `text` is the email body — it can be as detailed as it needs to be, since
 * the recipient reads it standalone outside the app. `inAppBody` is what's
 * stored/shown in the notification list (and pushed to browsers), which
 * already has its own "View" link and relative timestamp, so it should stay
 * short and skip the raw URL. Defaults to `text` if omitted. Invoice PDFs go
 * on `attachments`.
 */
export async function notifyUser(
  userId: string,
  subject: string,
  text: string,
  options: NotifyUserOptions,
): Promise<void> {
  const [prefs] = await db
    .select({
      emailEnabled: notificationPreference.emailEnabled,
      inAppEnabled: notificationPreference.inAppEnabled,
      pushEnabled: notificationPreference.pushEnabled,
    })
    .from(notificationPreference)
    .where(eq(notificationPreference.userId, userId));
  const emailEnabled = prefs?.emailEnabled ?? true;
  const inAppEnabled = prefs?.inAppEnabled ?? true;
  const pushEnabled = prefs?.pushEnabled ?? true;
  if (!emailEnabled && !inAppEnabled && !pushEnabled) return;

  const [recipient] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!recipient) return;

  if (inAppEnabled) {
    let row: typeof notification.$inferSelect | undefined;
    try {
      [row] = await db
        .insert(notification)
        .values({
          userId,
          title: subject,
          body: options.inAppBody ?? text,
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
  }

  if (emailEnabled) {
    try {
      await sendEmail({
        to: recipient.email,
        subject,
        text,
        ...(options.attachments ? { attachments: options.attachments } : {}),
      });
    } catch (err) {
      console.error(`Failed to send "${subject}" notification to ${recipient.email}`, err);
    }
  }

  if (pushEnabled) {
    try {
      const subscriptions = await db
        .select({
          endpoint: webPushSubscription.endpoint,
          p256dh: webPushSubscription.p256dh,
          auth: webPushSubscription.auth,
        })
        .from(webPushSubscription)
        .where(eq(webPushSubscription.userId, userId));

      if (subscriptions.length > 0) {
        const { staleEndpoints } = await sendWebPush(
          subscriptions.map((s) => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })),
          { title: subject, body: options.inAppBody ?? text, link: options.link ?? null },
        );
        if (staleEndpoints.length > 0) {
          await db
            .delete(webPushSubscription)
            .where(inArray(webPushSubscription.endpoint, staleEndpoints));
        }
      }
    } catch (err) {
      console.error(`Failed to push "${subject}" notification to ${recipient.email}`, err);
    }
  }
}
