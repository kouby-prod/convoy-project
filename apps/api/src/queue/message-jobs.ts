import { Queue } from 'bullmq';
import type { Message } from '@carpool/schemas';
import { createRedisConnection } from './redis';

export const MESSAGE_NOTIFY_QUEUE = 'message-notify';

/** Redis channel prefix — hub subscribes with `psubscribe(`${prefix}*`)`. */
export const MESSAGE_EVENTS_CHANNEL_PREFIX = 'messages:booking:';

export function bookingEventsChannel(bookingId: string): string {
  return `${MESSAGE_EVENTS_CHANNEL_PREFIX}${bookingId}`;
}

export type MessageNotifyJob = {
  message: Message;
  recipientId: string;
  trajetId: string;
  trip: {
    departureCity: string;
    arrivalCity: string;
    departureAt: string;
  };
};

let queue: Queue<MessageNotifyJob> | undefined;

function getQueue(): Queue<MessageNotifyJob> {
  if (!queue) {
    queue = new Queue<MessageNotifyJob>(MESSAGE_NOTIFY_QUEUE, {
      connection: createRedisConnection('message-queue'),
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
  }
  return queue;
}

/**
 * Enqueue offline delivery + Redis fan-out for a newly persisted message.
 * The HTTP handler returns as soon as the job is accepted — email and WS
 * fan-out run in the BullMQ worker so the API stays horizontally scalable.
 */
export async function enqueueMessageNotify(job: MessageNotifyJob): Promise<void> {
  await getQueue().add('notify', job, {
    jobId: `msg-${job.message.id}`,
  });
}

/** Test / shutdown helper — closes the lazy queue connection if it was opened. */
export async function closeMessageQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
