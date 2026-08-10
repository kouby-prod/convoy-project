'use client';

import { MessageThread } from '@/components/messages/message-thread';

/**
 * Inline message thread for one booking, shared by the driver's
 * booking-management view and the passenger's booking views — either the
 * trajet's driver or the booking's passenger can read and post here
 * (enforced server-side), independent of the booking's status. Collapsed by
 * default; opens the shared MessageThread (REST + optional WS).
 */
export function BookingMessages({ bookingId }: { bookingId: string }) {
  return <MessageThread bookingId={bookingId} variant="compact" />;
}
