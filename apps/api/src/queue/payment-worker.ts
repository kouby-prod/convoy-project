import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from './redis';
import {
  PAYMENT_EVENT_QUEUE,
  PAYMENT_RECONCILE_QUEUE,
  type PaymentEventJob,
} from './payment-jobs';
import { handlePayPalEvent, handleStripeEvent, markEventProcessed } from '../modules/payment/events';
import { runPaymentReconciliation } from '../modules/payment/reconcile';
import { releaseHeldDriverPayouts } from '../modules/payment/payout';
import { expireAllUnpaidBookings } from '../modules/payment/ttl';
import { purgeDueAccounts } from '../modules/account-deletion/purge';
import { recordPaymentIncident } from '../modules/payment/incidents';
import { notifyUser, describeTrip, trajetSearchUrl } from '../modules/trajet/notifications';

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
      void recordPaymentIncident({
        kind: 'worker_job_failed',
        provider: job?.data.provider,
        providerPaymentId: job?.data.eventId ?? job?.id,
        detail: { type: job?.data.type, error: err.message },
      });
    });
    console.log('[payment-worker] listening on queue', PAYMENT_EVENT_QUEUE);
  }
  if (!reconcileWorker) {
    reconcileWorker = new Worker(PAYMENT_RECONCILE_QUEUE, async (job) => {
      if (job.name === 'payout-release') {
        await releaseHeldDriverPayouts();
        return;
      }
      if (job.name === 'unpaid-expire') {
        const expired = await expireAllUnpaidBookings();
        for (const row of expired) {
          await notifyUser(
            row.passengerId,
            'Your Kouby payment window expired',
            `Your booking for ${describeTrip(row.trip)} expired because the invoice was not paid in time. Search for another ride: ${trajetSearchUrl()}`,
            { type: 'booking_status', link: trajetSearchUrl() },
          );
        }
        return;
      }
      if (job.name === 'account-purge') {
        const result = await purgeDueAccounts();
        if (result.purged || result.anonymized) {
          console.log('[account-deletion] purge', result);
        }
        return;
      }
      await runPaymentReconciliation();
    }, {
      connection: createRedisConnection('payment-reconcile-worker'),
      concurrency: 1,
    });
    reconcileWorker.on('failed', (job, err) => {
      console.error(`[payment-reconcile] job ${job?.id ?? '?'} failed:`, err);
      void recordPaymentIncident({
        kind: 'worker_job_failed',
        providerPaymentId: job?.id,
        detail: { queue: PAYMENT_RECONCILE_QUEUE, name: job?.name, error: err.message },
      });
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
