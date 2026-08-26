'use client';

import { MessageThread } from '@/components/messages/message-thread';

/**
 * Always-open composer on the driver booking case. Access is still
 * enforced server-side (trajet driver or booking passenger).
 */
export function BookingMessages({
  bookingId,
  pickupHints = false,
}: {
  bookingId: string;
  pickupHints?: boolean;
}) {
  return (
    <MessageThread
      bookingId={bookingId}
      variant="pane"
      className="min-h-72"
      pickupHints={pickupHints}
    />
  );
}
