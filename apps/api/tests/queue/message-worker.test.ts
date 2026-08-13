import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { MessageNotifyJob } from '../../src/queue/message-jobs';

const publish = vi.fn();
const notifyUser = vi.fn();

vi.mock('../../src/queue/redis', () => ({
  createRedisConnection: () => ({
    publish: (...a: unknown[]) => publish(...a),
    quit: vi.fn(),
    on: vi.fn(),
  }),
}));

vi.mock('../../src/modules/trajet/notifications', () => ({
  notifyUser: (...a: unknown[]) => notifyUser(...a),
  trajetUrl: (id: string) => `https://example.test/trajets/${id}`,
  describeTrip: (trip: { departureCity: string; arrivalCity: string; departureAt: Date }) =>
    `${trip.departureCity} to ${trip.arrivalCity} (departing ${trip.departureAt.toUTCString()})`,
}));

import { processMessageNotifyJob } from '../../src/queue/message-worker';

const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
const TRAJET_ID = '11111111-1111-4111-8111-111111111111';

describe('processMessageNotifyJob', () => {
  beforeEach(() => {
    publish.mockReset();
    publish.mockResolvedValue(1);
    notifyUser.mockReset();
    notifyUser.mockResolvedValue(undefined);
  });

  it('publishes a message.created event then emails the recipient', async () => {
    const data: MessageNotifyJob = {
      message: {
        id: MESSAGE_ID,
        bookingId: BOOKING_ID,
        senderId: 'passenger_1',
        body: 'On my way',
        createdAt: new Date().toISOString(),
      },
      recipientId: 'driver_1',
      trajetId: TRAJET_ID,
      trip: {
        departureCity: 'Montreal',
        arrivalCity: 'Quebec',
        departureAt: new Date('2026-08-07T12:00:00.000Z').toISOString(),
      },
    };

    await processMessageNotifyJob({ data } as Job<MessageNotifyJob>);

    expect(publish).toHaveBeenCalledWith(
      `messages:booking:${BOOKING_ID}`,
      expect.stringContaining('"type":"message.created"'),
    );
    expect(notifyUser).toHaveBeenCalledWith(
      'driver_1',
      expect.stringContaining('New message'),
      expect.stringContaining('On my way'),
      { type: 'message', link: `https://example.test/trajets/${TRAJET_ID}` },
    );
  });
});
