import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';
import { sendEmail } from '../../auth/email';
import { env } from '../../env';

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
 * Looks up `userId`'s email and sends it a plain-text notification. Failures
 * are logged, not thrown — there's no retry queue in this codebase, so a dead
 * SMTP server must never fail the booking action that triggered the email.
 */
export async function notifyUser(userId: string, subject: string, text: string): Promise<void> {
  const [recipient] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!recipient) return;

  try {
    await sendEmail({ to: recipient.email, subject, text });
  } catch (err) {
    console.error(`Failed to send "${subject}" notification to ${recipient.email}`, err);
  }
}
