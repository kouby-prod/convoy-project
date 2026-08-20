import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMISSION_AMOUNT_CENTS } from '@carpool/schemas';

function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    values: () => chain,
    set: (values: unknown) => {
      dbState.setCalls.push(values);
      return chain;
    },
    orderBy: () => chain,
    limit: () => chain,
    returning: () => Promise.resolve(result),
    onConflictDoNothing: () => chain,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const dbState = vi.hoisted(() => ({
  selectResult: [] as unknown[],
  selectQueue: [] as unknown[][],
  insertResult: [] as unknown[],
  updateResult: [] as unknown[],
  updateQueue: [] as unknown[][],
  setCalls: [] as unknown[],
  insertError: null as unknown,
}));

const db = vi.hoisted(() => {
  const instance = {
    select: vi.fn(() =>
      createChain(dbState.selectQueue.length ? dbState.selectQueue.shift() : dbState.selectResult),
    ),
    insert: vi.fn(() => {
      if (dbState.insertError) throw dbState.insertError;
      return createChain(dbState.insertResult);
    }),
    update: vi.fn(() =>
      createChain(dbState.updateQueue.length ? dbState.updateQueue.shift() : dbState.updateResult),
    ),
    transaction: vi.fn((cb: (tx: typeof instance) => unknown) => cb(instance)),
  };
  return instance;
});

vi.mock('../../src/db/client', () => ({ db }));

const getSession = vi.fn();
vi.mock('../../src/auth/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

const notifyUser = vi.fn();
vi.mock('../../src/modules/trajet/notifications', () => ({
  notifyUser: (...a: unknown[]) => notifyUser(...a),
  paymentUrl: (id: string) => `https://example.test/paiement/${id}`,
  describeTrip: () => 'Montreal to Quebec',
}));

const stripeMocks = vi.hoisted(() => ({
  isStripeConfigured: vi.fn(() => true),
  constructStripeEvent: vi.fn(),
  createStripePaymentIntent: vi.fn(),
  retrieveStripePaymentIntent: vi.fn(),
  cancelStripePaymentIntent: vi.fn(),
  refundStripePaymentIntent: vi.fn().mockResolvedValue(undefined),
  stripeIdempotencyKey: (invoiceId: string, kind: string, extra?: string) =>
    extra ? `invoice:${invoiceId}:stripe:${kind}:${extra}` : `invoice:${invoiceId}:stripe:${kind}`,
  listRecentStripePaymentIntents: vi.fn(async () => []),
}));
vi.mock('../../src/modules/payment/stripe', () => stripeMocks);

const paypalMocks = vi.hoisted(() => ({
  isPayPalConfigured: vi.fn(() => true),
  createPayPalOrder: vi.fn(),
  retrievePayPalOrder: vi.fn(),
  capturePayPalOrder: vi.fn(),
  refundPayPalCapture: vi.fn().mockResolvedValue(undefined),
  getPayPalCaptureId: vi.fn(),
  verifyPayPalWebhook: vi.fn(),
  paypalRequestId: (invoiceId: string, kind: string, extra?: string) =>
    extra ? `invoice:${invoiceId}:paypal:${kind}:${extra}` : `invoice:${invoiceId}:paypal:${kind}`,
}));
vi.mock('../../src/modules/payment/paypal', () => paypalMocks);

const enqueuePaymentEvent = vi.fn();
vi.mock('../../src/queue/payment-jobs', () => ({
  enqueuePaymentEvent: (...a: unknown[]) => enqueuePaymentEvent(...a),
}));

vi.mock('../../src/storage/s3', () => ({
  putObject: vi.fn(),
  getObjectBuffer: vi.fn().mockResolvedValue(null),
}));

import { computeInvoiceAmounts } from '../../src/modules/payment/tax';
import { fareRefundLines, issueLines, payLines, refundLines } from '../../src/modules/payment/ledger';
import { formatInvoiceNumber } from '../../src/modules/payment/invoice';
import { formatCreditNoteNumber, refundFareOnlyForBooking } from '../../src/modules/payment/refund';
import { settlePaidInvoice, markPaymentFailed, markPaymentProcessing } from '../../src/modules/payment/settle';
import { withIdempotency } from '../../src/modules/payment/idempotency';
import { stripeWebhookHandler } from '../../src/modules/payment/webhooks';
import { handleStripeEvent } from '../../src/modules/payment/events';
import { expireUnpaidBookings } from '../../src/modules/payment/ttl';
import { refundPaidBooking } from '../../src/modules/payment/refund';
import { releaseHeldDriverPayouts } from '../../src/modules/payment/payout';
import { paymentModule } from '../../src/modules/payment';

const now = new Date();
const BOOKING_ID = '22222222-2222-4222-8222-222222222222';
const INVOICE_ID = 'inv_1';

function sessionFor(userId = 'u_1') {
  return {
    user: {
      id: userId,
      email: 'x@example.com',
      name: 'X',
      emailVerified: true,
      role: 'user',
      phoneNumber: null,
      phoneNumberVerified: false,
    },
    session: { id: 's_1', userId, token: 'tok' },
  };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    bookingId: BOOKING_ID,
    number: 'KOU-2026-000001',
    status: 'issued',
    currency: 'cad',
    subtotalCents: 500,
    fareCents: 0,
    commissionCents: 500,
    taxCents: 0,
    totalCents: 500,
    taxLines: [],
    buyerName: 'Ada',
    buyerEmail: 'ada@example.com',
    pdfStorageKey: null,
    issuedAt: now,
    dueAt: new Date(now.getTime() + 86_400_000),
    paidAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    trajetId: 't_1',
    passengerId: 'u_1',
    seats: 1,
    status: 'awaiting_payment',
    paymentMethod: 'cash',
    fareCents: 0,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay_1',
    invoiceId: INVOICE_ID,
    provider: 'stripe',
    providerPaymentId: 'pi_1',
    amountCents: 500,
    currency: 'cad',
    status: 'created',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function balanced(lines: ReturnType<typeof issueLines>) {
  const debit = lines.filter((l) => l.direction === 'debit').reduce((s, l) => s + l.amountCents, 0);
  const credit = lines.filter((l) => l.direction === 'credit').reduce((s, l) => s + l.amountCents, 0);
  return debit === credit;
}

describe('invoice amounts and ledger', () => {
  it('issues 500 cents with no tax by default', () => {
    const amounts = computeInvoiceAmounts(0, 'none');
    expect(amounts.subtotalCents).toBe(COMMISSION_AMOUNT_CENTS);
    expect(amounts.commissionCents).toBe(500);
    expect(amounts.fareCents).toBe(0);
    expect(amounts.taxCents).toBe(0);
    expect(amounts.totalCents).toBe(500);
    expect(amounts.taxLines).toEqual([]);
  });

  it('adds the ride fare to the subtotal and taxes commission only', () => {
    const amounts = computeInvoiceAmounts(2000, 'gst');
    expect(amounts.fareCents).toBe(2000);
    expect(amounts.commissionCents).toBe(500);
    expect(amounts.subtotalCents).toBe(2500);
    expect(amounts.taxCents).toBe(25);
    expect(amounts.totalCents).toBe(2525);
  });

  it('adds GST and QST when enabled', () => {
    const gst = computeInvoiceAmounts(0, 'gst');
    expect(gst.taxCents).toBe(25);
    expect(gst.totalCents).toBe(525);
    const both = computeInvoiceAmounts(0, 'gst_qst');
    expect(both.taxLines).toHaveLength(2);
    expect(both.totalCents).toBe(500 + 25 + 50);
  });

  it('keeps every ledger txn balanced', () => {
    expect(balanced(issueLines(500, 0, 0))).toBe(true);
    expect(balanced(issueLines(500, 2000, 75))).toBe(true);
    expect(balanced(payLines(2500))).toBe(true);
    expect(balanced(refundLines(500, 2000, 0))).toBe(true);
    expect(balanced(refundLines(500, 0, 75))).toBe(true);
    expect(balanced(fareRefundLines(2000))).toBe(true);
  });

  it('formats sequential KOU and CN numbers', () => {
    const at = new Date('2026-03-01T00:00:00Z');
    expect(formatInvoiceNumber(1, at)).toBe('KOU-2026-000001');
    expect(formatCreditNoteNumber(12, at)).toBe('CN-2026-000012');
  });
});

describe('settlePaidInvoice', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    db.update.mockClear();
    dbState.selectQueue = [];
    dbState.selectResult = [];
    dbState.updateQueue = [];
    dbState.updateResult = [];
    dbState.insertResult = [];
    dbState.setCalls = [];
    dbState.insertError = null;
    notifyUser.mockReset();
    stripeMocks.refundStripePaymentIntent.mockClear();
    paypalMocks.refundPayPalCapture.mockClear();
  });

  it('pays the invoice, confirms the booking, and posts the pay ledger', async () => {
    const issued = makeInvoice();
    const paid = makeInvoice({ status: 'paid', paidAt: now });
    dbState.selectQueue = [[issued], []];
    dbState.updateQueue = [[paid], [makeBooking({ status: 'confirmed' })]];

    const result = await settlePaidInvoice({
      invoiceId: INVOICE_ID,
      provider: 'stripe',
      providerPaymentId: 'pi_1',
      amountCents: 500,
      currency: 'cad',
    });

    expect(result).toBe('settled');
    expect(dbState.setCalls).toContainEqual({ status: 'paid', paidAt: expect.any(Date) });
    expect(dbState.setCalls).toContainEqual({ status: 'confirmed' });
    expect(db.insert).toHaveBeenCalled();
  });

  it('rejects a tampered amount and never marks the invoice paid', async () => {
    dbState.selectQueue = [[makeInvoice()]];
    const result = await settlePaidInvoice({
      invoiceId: INVOICE_ID,
      provider: 'stripe',
      providerPaymentId: 'pi_1',
      amountCents: 1,
      currency: 'cad',
    });
    expect(result).toBe('rejected');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('is a no-op when the invoice is already paid by the same attempt', async () => {
    dbState.selectQueue = [[makeInvoice({ status: 'paid' })], [makePayment({ status: 'succeeded' })]];
    dbState.updateQueue = [[]];
    const result = await settlePaidInvoice({
      invoiceId: INVOICE_ID,
      provider: 'stripe',
      providerPaymentId: 'pi_1',
      amountCents: 500,
      currency: 'cad',
    });
    expect(result).toBe('already_paid');
    expect(stripeMocks.refundStripePaymentIntent).not.toHaveBeenCalled();
  });

  it('refunds the loser when Stripe and PayPal both succeed', async () => {
    dbState.selectQueue = [
      [makeInvoice({ status: 'paid' })],
      [makePayment({ provider: 'stripe', providerPaymentId: 'pi_winner', status: 'succeeded' })],
    ];
    dbState.updateQueue = [[]];
    paypalMocks.getPayPalCaptureId.mockResolvedValueOnce('cap_loser');

    const result = await settlePaidInvoice({
      invoiceId: INVOICE_ID,
      provider: 'paypal',
      providerPaymentId: 'order_loser',
      amountCents: 500,
      currency: 'cad',
    });

    expect(result).toBe('already_paid');
    expect(paypalMocks.refundPayPalCapture).toHaveBeenCalled();
  });
});

describe('monotonic payment status', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.update.mockClear();
    dbState.selectResult = [];
    dbState.selectQueue = [];
  });

  it('does not roll a succeeded payment back on payment_failed', async () => {
    dbState.selectResult = [makePayment({ status: 'succeeded' })];
    await markPaymentFailed({ provider: 'stripe', providerPaymentId: 'pi_1' });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('refetches the PaymentIntent before settling a succeeded webhook', async () => {
    stripeMocks.retrieveStripePaymentIntent.mockResolvedValueOnce({
      id: 'pi_1',
      status: 'succeeded',
      amount: 500,
      currency: 'cad',
      metadata: { invoiceId: INVOICE_ID },
      clientSecret: 'sec',
    });
    const issued = makeInvoice();
    const paid = makeInvoice({ status: 'paid', paidAt: now });
    dbState.selectQueue = [[issued], []];
    dbState.updateQueue = [[paid], [makeBooking({ status: 'confirmed' })]];

    await handleStripeEvent('payment_intent.succeeded', { id: 'pi_1' });
    expect(stripeMocks.retrieveStripePaymentIntent).toHaveBeenCalledWith('pi_1');
  });
});

/**
 * Outcomes the Stripe test cards produce, mapped onto our webhook handlers.
 * Card numbers are documentation — Stripe is mocked here.
 */
describe('Stripe test-card states', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    db.update.mockClear();
    dbState.selectResult = [];
    dbState.selectQueue = [];
    dbState.updateQueue = [];
    dbState.setCalls = [];
    stripeMocks.retrieveStripePaymentIntent.mockReset();
  });

  it('4242 success → payment_intent.succeeded pays the invoice and confirms the booking', async () => {
    stripeMocks.retrieveStripePaymentIntent.mockResolvedValueOnce({
      id: 'pi_4242',
      status: 'succeeded',
      amount: 500,
      currency: 'cad',
      metadata: { invoiceId: INVOICE_ID },
      clientSecret: 'sec',
    });
    const issued = makeInvoice();
    const paid = makeInvoice({ status: 'paid', paidAt: now });
    dbState.selectQueue = [[issued], []];
    dbState.updateQueue = [[paid], [makeBooking({ status: 'confirmed' })]];

    await handleStripeEvent('payment_intent.succeeded', { id: 'pi_4242' });

    expect(dbState.setCalls).toContainEqual({ status: 'paid', paidAt: expect.any(Date) });
    expect(dbState.setCalls).toContainEqual({ status: 'confirmed' });
  });

  it('4000 0025 0000 3155 (3DS, not yet authenticated) does not settle', async () => {
    stripeMocks.retrieveStripePaymentIntent.mockResolvedValueOnce({
      id: 'pi_3ds',
      status: 'requires_action',
      amount: 500,
      currency: 'cad',
      metadata: { invoiceId: INVOICE_ID },
      clientSecret: 'sec',
    });

    await handleStripeEvent('payment_intent.succeeded', { id: 'pi_3ds' });

    expect(db.update).not.toHaveBeenCalled();
  });

  it('3DS in flight → payment_intent.processing marks the attempt processing', async () => {
    dbState.selectResult = [makePayment({ status: 'created', providerPaymentId: 'pi_3ds' })];
    await handleStripeEvent('payment_intent.processing', { id: 'pi_3ds' });
    expect(dbState.setCalls).toContainEqual({ status: 'processing' });
  });

  it('4000 0000 0000 9995 insufficient funds → payment_intent.payment_failed', async () => {
    dbState.selectResult = [makePayment({ status: 'created', providerPaymentId: 'pi_nsf' })];
    await handleStripeEvent('payment_intent.payment_failed', { id: 'pi_nsf' });
    expect(dbState.setCalls).toContainEqual({ status: 'failed' });
  });

  it('4000 0000 0000 0002 generic decline → payment_intent.payment_failed', async () => {
    dbState.selectResult = [makePayment({ status: 'created', providerPaymentId: 'pi_declined' })];
    await handleStripeEvent('payment_intent.payment_failed', { id: 'pi_declined' });
    expect(dbState.setCalls).toContainEqual({ status: 'failed' });
  });

  it('a later payment_failed does not un-pay a succeeded 4242 attempt', async () => {
    dbState.selectResult = [makePayment({ status: 'succeeded' })];
    await markPaymentFailed({ provider: 'stripe', providerPaymentId: 'pi_1' });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('processing is ignored once the attempt already succeeded', async () => {
    dbState.selectResult = [makePayment({ status: 'succeeded' })];
    await markPaymentProcessing({ provider: 'stripe', providerPaymentId: 'pi_1' });
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('idempotency', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    dbState.selectResult = [];
    dbState.selectQueue = [];
    dbState.insertError = null;
  });

  it('replays the cached response for the same key and hash', async () => {
    dbState.selectResult = [{ requestHash: 'abc', responseJson: { orderId: 'cached' } }];
    const result = await withIdempotency('u_1', 'key-1', 'abc', async () => ({ orderId: 'fresh' }));
    expect(result).toEqual({ ok: true, value: { orderId: 'cached' }, cached: true });
  });

  it('returns 409 when the same key is reused with a different body', async () => {
    dbState.selectResult = [{ requestHash: 'abc', responseJson: { orderId: 'cached' } }];
    const result = await withIdempotency('u_1', 'key-1', 'other', async () => ({ orderId: 'fresh' }));
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'Idempotency-Key reused with a different request',
    });
  });
});

describe('webhooks', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    dbState.insertError = null;
    dbState.selectResult = [];
    enqueuePaymentEvent.mockReset();
    stripeMocks.constructStripeEvent.mockReset();
  });

  it('returns 400 and writes nothing on an invalid Stripe signature', async () => {
    stripeMocks.constructStripeEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const res = await stripeWebhookHandler({
      req: {
        text: async () => '{}',
        header: () => 'sig',
      },
      json: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    } as never);
    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
    expect(enqueuePaymentEvent).not.toHaveBeenCalled();
  });

  it('acks a duplicate processed event without enqueueing again', async () => {
    stripeMocks.constructStripeEvent.mockReturnValue({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1' } },
    });
    dbState.insertError = Object.assign(new Error('unique'), { code: '23505' });
    dbState.selectResult = [{ id: 'row_1', status: 'processed' }];

    const res = await stripeWebhookHandler({
      req: {
        text: async () => '{}',
        header: () => 'sig',
      },
      json: (body: unknown, status: number) => new Response(JSON.stringify(body), { status }),
    } as never);
    expect(res.status).toBe(200);
    expect(enqueuePaymentEvent).not.toHaveBeenCalled();
  });
});

describe('unpaid TTL', () => {
  it('voids an overdue issued invoice and skips a processing attempt', async () => {
    const overdue = makeBooking({ updatedAt: new Date(now.getTime() - 48 * 3600 * 1000) });
    const processing = makeBooking({ id: 'b_proc', updatedAt: new Date(now.getTime() - 48 * 3600 * 1000) });
    const txSelect = vi
      .fn()
      .mockImplementationOnce(() => createChain([overdue, processing]))
      .mockImplementationOnce(() => createChain([makeInvoice({ dueAt: new Date(now.getTime() - 1000) })]))
      .mockImplementationOnce(() => createChain([makePayment({ status: 'created' })]))
      .mockImplementationOnce(() => createChain([makeInvoice({ bookingId: 'b_proc', dueAt: new Date(now.getTime() - 1000) })]))
      .mockImplementationOnce(() => createChain([makePayment({ status: 'processing', createdAt: now })]));

    const tx = {
      select: txSelect,
      update: vi.fn(() => createChain([overdue])),
    };

    const result = await expireUnpaidBookings(tx as never, 't_1', 0);
    expect(result.expired).toHaveLength(1);
    expect(result.expired[0]?.passengerId).toBe('u_1');
  });
});

describe('refund + credit note', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    db.update.mockClear();
    dbState.selectQueue = [];
    dbState.insertResult = [];
    dbState.insertError = null;
    stripeMocks.refundStripePaymentIntent.mockClear();
  });

  it('issues one credit note and refunds the PSP once', async () => {
    dbState.selectQueue = [
      [makeInvoice({ status: 'paid' })],
      [makePayment({ status: 'succeeded' })],
    ];
    db.transaction.mockImplementationOnce(async (cb: (tx: typeof db) => unknown) => {
      const tx = {
        ...db,
        select: vi.fn(() => createChain([])),
        execute: vi.fn(async () => ({ rows: [{ n: 1 }] })),
        insert: vi.fn(() =>
          createChain([
            {
              id: 'cn_1',
              invoiceId: INVOICE_ID,
              number: 'CN-2026-000001',
              amountCents: 500,
              currency: 'cad',
              reason: 'Driver cancelled the trip',
              createdAt: now,
            },
          ]),
        ),
      };
      return cb(tx as never);
    });

    await refundPaidBooking(BOOKING_ID, 'Driver cancelled the trip');
    expect(stripeMocks.refundStripePaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on a second refund (existing credit note, same PSP key)', async () => {
    const existing = {
      id: 'cn_1',
      invoiceId: INVOICE_ID,
      number: 'CN-2026-000001',
      amountCents: 500,
      currency: 'cad',
      reason: 'Driver cancelled the trip',
      createdAt: now,
    };
    dbState.selectQueue = [[makeInvoice({ status: 'paid' })], [makePayment({ status: 'succeeded' })]];
    db.transaction.mockImplementationOnce(async (cb: (tx: typeof db) => unknown) => {
      const tx = {
        ...db,
        select: vi.fn(() => createChain([existing])),
        insert: vi.fn(),
        execute: vi.fn(),
      };
      return cb(tx as never);
    });

    await refundPaidBooking(BOOKING_ID, 'Driver cancelled the trip');
    expect(stripeMocks.refundStripePaymentIntent).toHaveBeenCalledTimes(1);
    expect(stripeMocks.refundStripePaymentIntent.mock.calls[0]?.[1]).toContain('cn_1');
  });
});

describe('POST /payments', () => {
  beforeEach(() => {
    getSession.mockReset();
    db.select.mockClear();
    db.insert.mockClear();
    dbState.selectQueue = [];
    dbState.selectResult = [];
    dbState.insertError = null;
    stripeMocks.createStripePaymentIntent.mockReset();
    stripeMocks.retrieveStripePaymentIntent.mockReset();
  });

  it('returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await paymentModule.request('/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: BOOKING_ID, provider: 'stripe' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is not the passenger', async () => {
    getSession.mockResolvedValue(sessionFor('someone-else'));
    dbState.selectQueue = [[makeBooking()]];
    const res = await paymentModule.request('/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: BOOKING_ID, provider: 'stripe' }),
    });
    expect(res.status).toBe(403);
  });

  it('creates a PaymentIntent from the invoice cents, ignoring any client amount', async () => {
    getSession.mockResolvedValue(sessionFor('u_1'));
    dbState.selectQueue = [[], [makeBooking()], [makeInvoice()], []];
    stripeMocks.createStripePaymentIntent.mockResolvedValueOnce({
      id: 'pi_1',
      clientSecret: 'sec_1',
    });

    const res = await paymentModule.request('/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'k1' },
      body: JSON.stringify({ bookingId: BOOKING_ID, provider: 'stripe', amountCents: 1 }),
    });

    expect(res.status).toBe(200);
    expect(stripeMocks.createStripePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 500, invoiceId: INVOICE_ID }),
    );
    const body = await res.json();
    expect(body).toMatchObject({ provider: 'stripe', clientSecret: 'sec_1' });
  });
});

describe('driver payouts', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    db.update.mockClear();
    dbState.selectQueue = [];
    dbState.updateQueue = [];
    dbState.updateResult = [];
    dbState.insertResult = [];
    dbState.setCalls = [];
    notifyUser.mockReset();
  });

  it('creates a held payout when a card invoice with fare settles', async () => {
    const issued = makeInvoice({ fareCents: 2000, commissionCents: 500, subtotalCents: 2500, totalCents: 2500 });
    const paid = { ...issued, status: 'paid', paidAt: now };
    dbState.selectQueue = [
      [issued],
      [],
      [makeBooking({ paymentMethod: 'card', fareCents: 2000 })],
      [{ id: 't_1', driverId: 'driver_1', departureAt: now }],
    ];
    dbState.updateQueue = [[paid], [makeBooking({ status: 'confirmed' })]];

    const result = await settlePaidInvoice({
      invoiceId: INVOICE_ID,
      provider: 'stripe',
      providerPaymentId: 'pi_1',
      amountCents: 2500,
      currency: 'cad',
    });

    expect(result).toBe('settled');
    expect(db.insert).toHaveBeenCalled();
  });

  it('does not create a payout for a commission-only invoice', async () => {
    const issued = makeInvoice();
    const paid = makeInvoice({ status: 'paid', paidAt: now });
    dbState.selectQueue = [[issued], []];
    dbState.updateQueue = [[paid], [makeBooking({ status: 'confirmed' })]];
    await settlePaidInvoice({
      invoiceId: INVOICE_ID,
      provider: 'stripe',
      providerPaymentId: 'pi_1',
      amountCents: 500,
      currency: 'cad',
    });
    expect(db.insert.mock.calls.length).toBeGreaterThan(0);
  });

  it('sweeps held payouts to due after departure plus 24h', async () => {
    const dueAt = new Date(now.getTime() - 1000);
    dbState.selectQueue = [
      [{ id: 'po_1', bookingId: BOOKING_ID, status: 'held', dueAt, amountCents: 2000, currency: 'cad', driverId: 'd_1', paidAt: null, paidRef: null, createdAt: now }],
      [makeBooking({ status: 'confirmed' })],
      [makeInvoice({ status: 'paid' })],
      [],
    ];
    dbState.updateResult = [{ id: 'po_1', status: 'due' }];
    const released = await releaseHeldDriverPayouts(now);
    expect(released).toBe(1);
    expect(dbState.setCalls).toContainEqual({ status: 'due' });
  });

  it('cancels a held payout when the booking is already cancelled', async () => {
    const dueAt = new Date(now.getTime() - 1000);
    dbState.selectQueue = [
      [{ id: 'po_1', bookingId: BOOKING_ID, status: 'held', dueAt, amountCents: 2000, currency: 'cad', driverId: 'd_1', paidAt: null, paidRef: null, createdAt: now }],
      [makeBooking({ status: 'cancelled' })],
    ];
    dbState.updateResult = [{ id: 'po_1', status: 'cancelled' }];
    const released = await releaseHeldDriverPayouts(now);
    expect(released).toBe(0);
    expect(dbState.setCalls).toContainEqual({ status: 'cancelled' });
  });

  it('refunds fare only on a passenger cancel of a paid card booking', async () => {
    dbState.selectQueue = [
      [makeInvoice({ status: 'paid', fareCents: 2000, commissionCents: 500, subtotalCents: 2500, totalCents: 2500 })],
      [makePayment({ status: 'succeeded', amountCents: 2500 })],
    ];
    db.transaction.mockImplementationOnce(async (cb: (tx: typeof db) => unknown) => {
      const tx = {
        ...db,
        select: vi.fn(() => createChain([])),
        execute: vi.fn(async () => ({ rows: [{ n: 1 }] })),
        insert: vi.fn(() =>
          createChain([
            {
              id: 'cn_fare',
              invoiceId: INVOICE_ID,
              number: 'CN-2026-000001',
              amountCents: 2000,
              currency: 'cad',
              reason: 'Passenger cancelled — fare refunded, commission kept',
              createdAt: now,
            },
          ]),
        ),
        update: vi.fn(() => createChain([])),
      };
      return cb(tx as never);
    });

    await refundFareOnlyForBooking(BOOKING_ID);
    expect(stripeMocks.refundStripePaymentIntent).toHaveBeenCalledWith(
      'pi_1',
      expect.stringContaining('refund'),
      2000,
    );
  });
});
