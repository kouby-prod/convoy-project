import { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type {
  CheckoutBookingSummary,
  CheckoutResponse,
  CreditNote as CreditNoteDto,
  Invoice,
  Payment as PaymentDto,
} from '@carpool/schemas';
import { CheckoutBookingSummarySchema, CreditNoteSchema, InvoiceSchema, PaymentSchema } from '@carpool/schemas';
import { requireAuth, getAuth, hasRole, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { creditNote, invoice, payment } from '../../db/payment';
import { booking, trajet } from '../../db/trajet-schema';
import { hashRequest, serializeInvoice } from './invoice';
import { withIdempotency } from './idempotency';
import {
  createStripePaymentIntent,
  isStripeConfigured,
  retrieveStripePaymentIntent,
} from './stripe';
import {
  capturePayPalOrder,
  createPayPalOrder,
  isPayPalConfigured,
  retrievePayPalOrder,
} from './paypal';
import { settlePaidInvoice } from './settle';
import { renderInvoicePdf } from './pdf';
import { renderInvoiceHtml } from './html';
import { putObject, getObjectBuffer } from '../../storage/s3';
import {
  capturePayPalRoute,
  createPaymentRoute,
  getInvoiceByBookingRoute,
  getInvoiceRoute,
  getPaymentByBookingRoute,
} from './payment.routes';

const app = new OpenAPIHono<AuthEnv>();

app.use('/payments', requireAuth);
app.use('/payments/*', requireAuth);
app.use('/invoices/*', requireAuth);
app.use('/invoices/:id', requireAuth);
app.use('/invoices/:id/pdf', requireAuth);
app.use('/invoices/:id/html', requireAuth);

async function serializeCheckoutBooking(
  bookingRow: typeof booking.$inferSelect,
): Promise<CheckoutBookingSummary | null> {
  const [trip] = await db.select().from(trajet).where(eq(trajet.id, bookingRow.trajetId));
  if (!trip) return null;
  return CheckoutBookingSummarySchema.parse({
    id: bookingRow.id,
    trajetId: bookingRow.trajetId,
    status: bookingRow.status,
    paymentMethod: bookingRow.paymentMethod ?? 'cash',
    seats: bookingRow.seats,
    trajet: {
      departureCity: trip.departureCity,
      destinationCity: trip.arrivalCity,
      departureDateTime: trip.departureAt.toISOString(),
      pricePerSeat: Number(trip.pricePerSeat),
    },
  });
}

function serializePayment(row: typeof payment.$inferSelect): PaymentDto {
  return PaymentSchema.parse({
    id: row.id,
    invoiceId: row.invoiceId,
    provider: row.provider,
    providerPaymentId: row.providerPaymentId,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function serializeCreditNote(row: typeof creditNote.$inferSelect): CreditNoteDto {
  return CreditNoteSchema.parse({
    id: row.id,
    invoiceId: row.invoiceId,
    number: row.number,
    amountCents: row.amountCents,
    currency: row.currency,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  });
}

async function loadBookingAuth(bookingId: string, userId: string, isAdmin: boolean) {
  const [bookingRow] = await db.select().from(booking).where(eq(booking.id, bookingId));
  if (!bookingRow) return { ok: false as const, status: 404 as const, error: 'Booking not found' };
  if (bookingRow.passengerId === userId || isAdmin) {
    return { ok: true as const, booking: bookingRow };
  }
  const [trip] = await db.select().from(trajet).where(eq(trajet.id, bookingRow.trajetId));
  if (trip && trip.driverId === userId) {
    return { ok: true as const, booking: bookingRow };
  }
  return { ok: false as const, status: 403 as const, error: 'Not allowed' };
}

async function paymentStateForInvoice(invoiceId: string) {
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, invoiceId));
  const [pay] = await db
    .select()
    .from(payment)
    .where(eq(payment.invoiceId, invoiceId))
    .orderBy(desc(payment.createdAt))
    .limit(1);
  const [note] = await db.select().from(creditNote).where(eq(creditNote.invoiceId, invoiceId));
  return {
    invoice: inv ? serializeInvoice(inv) : null,
    payment: pay ? serializePayment(pay) : null,
    creditNote: note ? serializeCreditNote(note) : null,
  };
}

async function startCheckout(
  userId: string,
  bookingId: string,
  provider: 'stripe' | 'paypal',
): Promise<
  | { ok: true; value: CheckoutResponse }
  | { ok: false; status: 400 | 403 | 404 | 503; error: string }
> {
  const [bookingRow] = await db.select().from(booking).where(eq(booking.id, bookingId));
  if (!bookingRow) return { ok: false, status: 404, error: 'Booking not found' };
  if (bookingRow.passengerId !== userId) return { ok: false, status: 403, error: 'Not your booking' };
  if (bookingRow.status !== 'awaiting_payment') {
    return { ok: false, status: 400, error: 'Booking is not awaiting payment' };
  }
  const [inv] = await db.select().from(invoice).where(eq(invoice.bookingId, bookingId));
  if (!inv || inv.status !== 'issued') return { ok: false, status: 400, error: 'Invoice is not payable' };

  if (provider === 'stripe' && !isStripeConfigured()) {
    return { ok: false, status: 503, error: 'Stripe is not configured' };
  }
  if (provider === 'paypal' && !isPayPalConfigured()) {
    return { ok: false, status: 503, error: 'PayPal is not configured' };
  }

  const [open] = await db
    .select()
    .from(payment)
    .where(
      and(
        eq(payment.invoiceId, inv.id),
        eq(payment.provider, provider),
      ),
    )
    .orderBy(desc(payment.createdAt))
    .limit(1);

  if (open && open.status !== 'refunded' && open.status !== 'cancelled') {
    if (provider === 'stripe') {
      const intent = await retrieveStripePaymentIntent(open.providerPaymentId);
      return {
        ok: true,
        value: {
          provider,
          clientSecret: intent.clientSecret,
          orderId: null,
          invoice: serializeInvoice(inv),
        },
      };
    }
    return {
      ok: true,
      value: {
        provider,
        clientSecret: null,
        orderId: open.providerPaymentId,
        invoice: serializeInvoice(inv),
      },
    };
  }

  if (provider === 'stripe') {
    const intent = await createStripePaymentIntent({
      invoiceId: inv.id,
      bookingId,
      invoiceNumber: inv.number,
      amountCents: inv.totalCents,
      currency: inv.currency,
    });
    await db.insert(payment).values({
      id: randomUUID(),
      invoiceId: inv.id,
      provider: 'stripe',
      providerPaymentId: intent.id,
      amountCents: inv.totalCents,
      currency: inv.currency,
      status: 'created',
    });
    return {
      ok: true,
      value: {
        provider,
        clientSecret: intent.clientSecret,
        orderId: null,
        invoice: serializeInvoice(inv),
      },
    };
  }

  const order = await createPayPalOrder({
    invoiceId: inv.id,
    invoiceNumber: inv.number,
    amountCents: inv.totalCents,
    currency: inv.currency,
  });
  await db.insert(payment).values({
    id: randomUUID(),
    invoiceId: inv.id,
    provider: 'paypal',
    providerPaymentId: order.id,
    amountCents: inv.totalCents,
    currency: inv.currency,
    status: 'created',
  });
  return {
    ok: true,
    value: {
      provider,
      clientSecret: null,
      orderId: order.id,
      invoice: serializeInvoice(inv),
    },
  };
}

export const paymentModule = app
  .openapi(createPaymentRoute, async (c) => {
    const { user } = getAuth(c);
    const body = c.req.valid('json');
    const idempotency = c.req.header('Idempotency-Key') ?? c.req.header('idempotency-key');
    const hashed = hashRequest(body);
    try {
      const wrapped = await withIdempotency(user.id, idempotency ?? undefined, hashed, async () => {
        const started = await startCheckout(user.id, body.bookingId, body.provider);
        if (!started.ok) {
          throw Object.assign(new Error(started.error), { httpStatus: started.status });
        }
        return started.value;
      });
      if (!wrapped.ok) return c.json({ error: wrapped.error }, wrapped.status);
      return c.json(wrapped.value, 200);
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'httpStatus' in err) {
        const message = err instanceof Error ? err.message : 'Checkout failed';
        const status = (err as { httpStatus: 400 | 403 | 404 | 503 }).httpStatus;
        if (status === 400) return c.json({ error: message }, 400);
        if (status === 403) return c.json({ error: message }, 403);
        if (status === 404) return c.json({ error: message }, 404);
        return c.json({ error: message }, 503);
      }
      throw err;
    }
  })
  .openapi(capturePayPalRoute, async (c) => {
    const { user } = getAuth(c);
    if (!isPayPalConfigured()) return c.json({ error: 'PayPal is not configured' }, 503);
    const { orderId } = c.req.valid('json');
    const order = await retrievePayPalOrder(orderId);
    if (!order.invoiceId) return c.json({ error: 'Order is missing invoice metadata' }, 400);
    const [inv] = await db.select().from(invoice).where(eq(invoice.id, order.invoiceId));
    if (!inv) return c.json({ error: 'Invoice not found' }, 404);
    const [bookingRow] = await db.select().from(booking).where(eq(booking.id, inv.bookingId));
    if (!bookingRow) return c.json({ error: 'Booking not found' }, 404);
    if (bookingRow.passengerId !== user.id) return c.json({ error: 'Not your booking' }, 403);

    const captured = await capturePayPalOrder(orderId, inv.id);
    if (captured.status === 'COMPLETED' || captured.status === 'APPROVED') {
      await settlePaidInvoice({
        invoiceId: inv.id,
        provider: 'paypal',
        providerPaymentId: captured.id,
        amountCents: captured.amountCents,
        currency: captured.currency,
      });
    }
    const checkoutBooking = await serializeCheckoutBooking(bookingRow);
    return c.json({ ...(await paymentStateForInvoice(inv.id)), booking: checkoutBooking }, 200);
  })
  .openapi(getPaymentByBookingRoute, async (c) => {
    const { user } = getAuth(c);
    const { bookingId } = c.req.valid('param');
    const authz = await loadBookingAuth(bookingId, user.id, hasRole(user, 'admin'));
    if (!authz.ok) return c.json({ error: authz.error }, authz.status);
    const checkoutBooking = await serializeCheckoutBooking(authz.booking);
    const [inv] = await db.select().from(invoice).where(eq(invoice.bookingId, bookingId));
    if (!inv) {
      return c.json({ invoice: null, payment: null, creditNote: null, booking: checkoutBooking }, 200);
    }
    return c.json({ ...(await paymentStateForInvoice(inv.id)), booking: checkoutBooking }, 200);
  })
  .openapi(getInvoiceByBookingRoute, async (c) => {
    const { user } = getAuth(c);
    const { bookingId } = c.req.valid('param');
    const authz = await loadBookingAuth(bookingId, user.id, hasRole(user, 'admin'));
    if (!authz.ok) return c.json({ error: authz.error }, authz.status);
    const [inv] = await db.select().from(invoice).where(eq(invoice.bookingId, bookingId));
    if (!inv) return c.json({ error: 'Invoice not found' }, 404);
    return c.json(serializeInvoice(inv), 200);
  })
  .openapi(getInvoiceRoute, async (c) => {
    const { user } = getAuth(c);
    const { id } = c.req.valid('param');
    const [inv] = await db.select().from(invoice).where(eq(invoice.id, id));
    if (!inv) return c.json({ error: 'Not found' }, 404);
    const authz = await loadBookingAuth(inv.bookingId, user.id, hasRole(user, 'admin'));
    if (!authz.ok) return c.json({ error: authz.error }, authz.status);
    return c.json(serializeInvoice(inv), 200);
  });

app.get('/invoices/:id/pdf', async (c) => {
  const { user } = getAuth(c);
  const id = c.req.param('id');
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, id));
  if (!inv) return c.json({ error: 'Not found' }, 404);
  const authz = await loadBookingAuth(inv.bookingId, user.id, hasRole(user, 'admin'));
  if (!authz.ok) return c.json({ error: authz.error }, authz.status);

  const serialized: Invoice = serializeInvoice(inv);
  const key = inv.pdfStorageKey ?? `invoices/${inv.number}.pdf`;
  let bytes = await getObjectBuffer(key).catch(() => null);
  if (!bytes) {
    bytes = await renderInvoicePdf(serialized);
    await putObject(key, bytes, 'application/pdf').catch((err: unknown) => {
      console.error('[payment] failed to store invoice PDF', err);
    });
    if (!inv.pdfStorageKey) {
      await db.update(invoice).set({ pdfStorageKey: key }).where(eq(invoice.id, inv.id));
    }
  }
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${inv.number}.pdf"`,
    },
  });
});

app.get('/invoices/:id/html', async (c) => {
  const { user } = getAuth(c);
  const id = c.req.param('id');
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, id));
  if (!inv) return c.json({ error: 'Not found' }, 404);
  const authz = await loadBookingAuth(inv.bookingId, user.id, hasRole(user, 'admin'));
  if (!authz.ok) return c.json({ error: authz.error }, authz.status);
  return c.html(renderInvoiceHtml(serializeInvoice(inv)));
});

export { InvoiceSchema };
