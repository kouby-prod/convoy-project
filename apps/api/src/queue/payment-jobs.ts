import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { createRedisConnection } from './redis';

export const PAYMENT_EVENT_QUEUE = 'payment-events';
export const PAYMENT_RECONCILE_QUEUE = 'payment-reconcile';

export type PaymentEventJob = {
  processedEventRowId: string;
  provider: 'stripe' | 'paypal';
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
};

let eventQueue: Queue<PaymentEventJob> | undefined;
let reconcileQueue: Queue | undefined;

function getEventQueue(): Queue<PaymentEventJob> {
  if (!eventQueue) {
    eventQueue = new Queue<PaymentEventJob>(PAYMENT_EVENT_QUEUE, {
      connection: createRedisConnection('payment-queue'),
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 8,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
  }
  return eventQueue;
}

/** BullMQ custom job IDs cannot contain `:`. */
export function paymentEventJobId(provider: PaymentEventJob['provider'], eventId: string): string {
  return `${provider}__${eventId}`;
}

function getReconcileQueue(): Queue {
  if (!reconcileQueue) {
    reconcileQueue = new Queue(PAYMENT_RECONCILE_QUEUE, {
      connection: createRedisConnection('payment-reconcile-queue'),
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });
  }
  return reconcileQueue;
}

export async function enqueuePaymentEvent(job: PaymentEventJob): Promise<void> {
  await getEventQueue().add('event', job, { jobId: paymentEventJobId(job.provider, job.eventId) });
}

export async function schedulePaymentReconcile(): Promise<void> {
  await getReconcileQueue().upsertJobScheduler(
    'payment-reconcile-daily',
    { pattern: '0 6 * * *' },
    { name: 'daily', data: {} },
  );
  await getReconcileQueue().upsertJobScheduler(
    'driver-payout-release-hourly',
    { pattern: '15 * * * *' },
    { name: 'payout-release', data: {} },
  );
  await getReconcileQueue().removeJobScheduler('unpaid-invoice-expire-quarter-hour').catch(() => undefined);
  await getReconcileQueue().upsertJobScheduler(
    'unpaid-invoice-expire-minute',
    { pattern: '* * * * *' },
    { name: 'unpaid-expire', data: {} },
  );
}

export async function enqueuePaymentReconcileNow(): Promise<void> {
  await getReconcileQueue().add('run', { id: randomUUID() });
}

export async function closePaymentQueues(): Promise<void> {
  if (eventQueue) {
    await eventQueue.close();
    eventQueue = undefined;
  }
  if (reconcileQueue) {
    await reconcileQueue.close();
    reconcileQueue = undefined;
  }
}
