import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from './redis';
import {
  PAYMENT_EVENT_QUEUE,
  PAYMENT_RECONCILE_QUEUE,
  type PaymentEventJob,
} from './payment-jobs';
import { handlePayPalEvent, handleStripeEvent, markEventProcessed } from '../modules/payment/events';
import { runPaymentReconciliation } from '../modules/payment/reconcile';

let eventWorker: Worker<PaymentEventJob> | undefined;
let reconcileWorker: Worker | undefined;

export async function processPaymentEventJob(job: Job<PaymentEventJob>): Promise<void> {
  const { provider, type, payload, processedEventRowId } = job.data;
  if (provider === 'stripe') {
    await handleStripeEvent(type, payload);
  } else {
    await handlePayPalEvent(type, payload);
  }
  await markEventProcessed(processedEventRowId);
}

export function startPaymentWorkers(): void {
  if (!eventWorker) {
    eventWorker = new Worker<PaymentEventJob>(PAYMENT_EVENT_QUEUE, processPaymentEventJob, {
      connection: createRedisConnection('payment-worker'),
      concurrency: 5,
    });
    eventWorker.on('failed', (job, err) => {
      console.error(`[payment-worker] job ${job?.id ?? '?'} failed:`, err);
    });
    console.log('[payment-worker] listening on queue', PAYMENT_EVENT_QUEUE);
  }
  if (!reconcileWorker) {
    reconcileWorker = new Worker(PAYMENT_RECONCILE_QUEUE, async () => {
      await runPaymentReconciliation();
    }, {
      connection: createRedisConnection('payment-reconcile-worker'),
      concurrency: 1,
    });
    reconcileWorker.on('failed', (job, err) => {
      console.error(`[payment-reconcile] job ${job?.id ?? '?'} failed:`, err);
    });
    console.log('[payment-reconcile] listening on queue', PAYMENT_RECONCILE_QUEUE);
  }
}

export async function stopPaymentWorkers(): Promise<void> {
  if (eventWorker) {
    await eventWorker.close();
    eventWorker = undefined;
  }
  if (reconcileWorker) {
    await reconcileWorker.close();
    reconcileWorker = undefined;
  }
}
