import { describe, expect, it } from 'vitest';
import { paymentEventJobId } from '../../src/queue/payment-jobs';

describe('paymentEventJobId', () => {
  it('never contains a colon (BullMQ rejects those custom ids)', () => {
    const id = paymentEventJobId('stripe', 'evt_3U6C56K39l3fYUYX11c06hct');
    expect(id).not.toContain(':');
    expect(id).toBe('stripe__evt_3U6C56K39l3fYUYX11c06hct');
  });
});
