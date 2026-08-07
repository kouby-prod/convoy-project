import { Worker, type Job } from 'bullmq';
import { MessageSchema } from '@carpool/schemas';
import { notifyUser, trajetUrl, describeTrip } from '../modules/trajet/notifications';
import { createRedisConnection } from './redis';
import {
  MESSAGE_NOTIFY_QUEUE,
  bookingEventsChannel,
  type MessageNotifyJob,
} from './message-jobs';

let worker: Worker<MessageNotifyJob> | undefined;
let publisher: ReturnType<typeof createRedisConnection> | undefined;

/**
 * Process one notify job: publish the live event for WebSocket hubs, then
 * send the email. Pub/sub first so online peers see the message even if SMTP
 * is slow; email retries are owned by BullMQ's attempt/backoff settings.
 */
export async function processMessageNotifyJob(job: Job<MessageNotifyJob>): Promise<void> {
  const data = job.data;
  const message = MessageSchema.parse(data.message);

  if (!publisher) {
    publisher = createRedisConnection('message-publisher');
  }

  await publisher.publish(
    bookingEventsChannel(message.bookingId),
    JSON.stringify({ type: 'message.created', message }),
  );

  const trip = {
    departureCity: data.trip.departureCity,
    arrivalCity: data.trip.arrivalCity,
    departureAt: new Date(data.trip.departureAt),
  };

  await notifyUser(
    data.recipientId,
    'New message on your Carpool trip',
    `You have a new message about the trip from ${describeTrip(trip)}: "${message.body}". ` +
      `Reply here: ${trajetUrl(data.trajetId)}`,
  );
}

/**
 * Start the in-process BullMQ worker. Safe to call once at API boot; for
 * larger deployments the same module can be imported from a dedicated
 * worker entry that skips HTTP/WS.
 */
export function startMessageWorker(): Worker<MessageNotifyJob> {
  if (worker) return worker;

  worker = new Worker<MessageNotifyJob>(MESSAGE_NOTIFY_QUEUE, processMessageNotifyJob, {
    connection: createRedisConnection('message-worker'),
    concurrency: 10,
  });

  worker.on('failed', (job, err) => {
    console.error(`[message-worker] job ${job?.id ?? '?'} failed:`, err);
  });

  console.log('[message-worker] listening on queue', MESSAGE_NOTIFY_QUEUE);
  return worker;
}

export async function stopMessageWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = undefined;
  }
  if (publisher) {
    await publisher.quit();
    publisher = undefined;
  }
}
