import { initObservability } from '../observability';
import { schedulePaymentReconcile, closePaymentQueues } from '../queue/payment-jobs';
import { startPaymentWorkers, stopPaymentWorkers } from '../queue/payment-worker';

/**
 * Dedicated payment worker — consumes BullMQ payment-events + payment-reconcile.
 * HTTP stays on `server.ts`. Compose runs this as `payment-worker`.
 */
initObservability('payment-worker');
startPaymentWorkers();
void schedulePaymentReconcile().catch((err: unknown) => {
  console.error('[payment-worker] failed to schedule reconcile job', err);
});
console.log('[payment-worker] process ready');

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[payment-worker] ${signal} received — shutting down`);
  try {
    await stopPaymentWorkers();
    await closePaymentQueues();
  } catch (err) {
    console.error('[payment-worker] error while stopping', err);
  }
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
