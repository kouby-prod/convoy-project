import { z } from 'zod';
import {
  BookingSchema,
  BookingStatusSchema,
  BookingTrajetSummarySchema,
  paginatedSchema,
  RidePaymentMethodSchema,
} from './trajet';

/**
 * Platform booking commission — the only amount Kouby charges. Copied onto
 * every invoice at issue time; never taken from the client.
 */
export const COMMISSION_AMOUNT_CENTS = 400;
export const COMMISSION_CURRENCY = 'cad';

export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export const TaxModeSchema = z.enum(['none', 'gst', 'gst_qst']);
export type TaxMode = z.infer<typeof TaxModeSchema>;

/** Quebec: TPS 5 % + TVQ 9,975 % on the commission only (fare is a pass-through). */
export const PRODUCT_TAX_MODE: TaxMode = 'gst_qst';

export const PaymentProviderSchema = z.enum(['stripe', 'paypal']);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

export const InvoiceStatusSchema = z.enum(['draft', 'issued', 'paid', 'voided']);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const PaymentStatusSchema = z.enum([
  'created',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'refunded',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const TaxLineSchema = z
  .object({
    code: z.enum(['gst', 'qst']),
    label: z.string(),
    rate: z.number(),
    amountCents: z.number().int().nonnegative(),
  })
  .describe('TaxLine');
export type TaxLine = z.infer<typeof TaxLineSchema>;

export function roundTaxCents(baseCents: number, rate: number): number {
  return Math.round(baseCents * rate);
}

export function commissionTaxLines(mode: TaxMode): TaxLine[] {
  const lines: TaxLine[] = [];
  if (mode === 'gst' || mode === 'gst_qst') {
    lines.push({
      code: 'gst',
      label: 'TPS',
      rate: GST_RATE,
      amountCents: roundTaxCents(COMMISSION_AMOUNT_CENTS, GST_RATE),
    });
  }
  if (mode === 'gst_qst') {
    lines.push({
      code: 'qst',
      label: 'TVQ',
      rate: QST_RATE,
      amountCents: roundTaxCents(COMMISSION_AMOUNT_CENTS, QST_RATE),
    });
  }
  return lines;
}

export function commissionTaxCents(mode: TaxMode): number {
  return commissionTaxLines(mode).reduce((sum, line) => sum + line.amountCents, 0);
}

export const InvoiceSchema = z
  .object({
    id: z.string(),
    bookingId: z.string(),
    number: z.string(),
    status: InvoiceStatusSchema,
    currency: z.string(),
    subtotalCents: z.number().int().nonnegative(),
    fareCents: z.number().int().nonnegative(),
    commissionCents: z.number().int().nonnegative(),
    taxCents: z.number().int().nonnegative(),
    totalCents: z.number().int().nonnegative(),
    taxLines: z.array(TaxLineSchema),
    buyerName: z.string(),
    buyerEmail: z.string(),
    issuedAt: z.string().describe('ISO-8601 timestamp'),
    dueAt: z.string().describe('ISO-8601 timestamp'),
    paidAt: z.string().nullable().describe('ISO-8601 timestamp'),
    createdAt: z.string().describe('ISO-8601 timestamp'),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('Invoice');
export type Invoice = z.infer<typeof InvoiceSchema>;

export const CreditNoteSchema = z
  .object({
    id: z.string(),
    invoiceId: z.string(),
    number: z.string(),
    amountCents: z.number().int().nonnegative(),
    currency: z.string(),
    reason: z.string(),
    createdAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('CreditNote');
export type CreditNote = z.infer<typeof CreditNoteSchema>;

export const PaymentSchema = z
  .object({
    id: z.string(),
    invoiceId: z.string(),
    provider: PaymentProviderSchema,
    providerPaymentId: z.string(),
    amountCents: z.number().int().nonnegative(),
    currency: z.string(),
    status: PaymentStatusSchema,
    createdAt: z.string().describe('ISO-8601 timestamp'),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('Payment');
export type Payment = z.infer<typeof PaymentSchema>;

export const CreatePaymentSchema = z
  .object({
    bookingId: z.string().min(1),
    provider: PaymentProviderSchema,
    // PayPal-only, and only meaningful for a web caller: where to send the
    // buyer back if PayPal falls back to a full-page redirect instead of the
    // JS SDK's popup (blocked popup, certain funding sources). Omit on
    // mobile — the server falls back to the app's own `carpool://` deep
    // link, which a browser could never open.
    returnUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  })
  .describe('CreatePayment');
export type CreatePayment = z.infer<typeof CreatePaymentSchema>;

export const CheckoutResponseSchema = z
  .object({
    provider: PaymentProviderSchema,
    clientSecret: z.string().nullable(),
    orderId: z.string().nullable(),
    /**
     * PayPal's `rel: "approve"` link — where a buyer not using the web JS
     * SDK's popup (i.e. a native client opening an in-app browser) is sent to
     * authorize the payment. Always null for `provider: "stripe"`.
     */
    approvalUrl: z.string().nullable(),
    invoice: InvoiceSchema,
    customerSessionClientSecret: z.string().nullable().optional(),
  })
  .describe('CheckoutResponse');
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const SavedPaymentMethodSchema = z
  .object({
    id: z.string(),
    brand: z.string(),
    last4: z.string(),
    expMonth: z.number().int(),
    expYear: z.number().int(),
    isDefault: z.boolean(),
  })
  .describe('SavedPaymentMethod');
export type SavedPaymentMethod = z.infer<typeof SavedPaymentMethodSchema>;

export const SavedPaymentMethodListSchema = z
  .object({
    configured: z.boolean(),
    items: SavedPaymentMethodSchema.array(),
  })
  .describe('SavedPaymentMethodList');
export type SavedPaymentMethodList = z.infer<typeof SavedPaymentMethodListSchema>;

export const SetupIntentResponseSchema = z
  .object({
    clientSecret: z.string(),
  })
  .describe('SetupIntentResponse');
export type SetupIntentResponse = z.infer<typeof SetupIntentResponseSchema>;

export const CapturePayPalSchema = z
  .object({
    orderId: z.string().min(1),
  })
  .describe('CapturePayPal');
export type CapturePayPal = z.infer<typeof CapturePayPalSchema>;

export const ConfirmStripeSchema = z
  .object({
    bookingId: z.string().min(1),
  })
  .describe('ConfirmStripe');
export type ConfirmStripe = z.infer<typeof ConfirmStripeSchema>;

export const ReconciliationMismatchStatusSchema = z.enum(['open', 'resolved']);
export type ReconciliationMismatchStatus = z.infer<typeof ReconciliationMismatchStatusSchema>;

export const ReconciliationMismatchSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    provider: z.string().nullable(),
    providerPaymentId: z.string().nullable(),
    invoiceId: z.string().nullable(),
    detail: z.unknown(),
    status: ReconciliationMismatchStatusSchema,
    note: z.string().nullable(),
    createdAt: z.string().describe('ISO-8601 timestamp'),
    resolvedAt: z.string().nullable().describe('ISO-8601 timestamp'),
    resolvedBy: z.string().nullable(),
  })
  .describe('ReconciliationMismatch');
export type ReconciliationMismatch = z.infer<typeof ReconciliationMismatchSchema>;

export const ResolveMismatchSchema = z
  .object({
    note: z.string().trim().max(500).optional(),
  })
  .describe('ResolveMismatch');
export type ResolveMismatch = z.infer<typeof ResolveMismatchSchema>;

export const CheckoutBookingSummarySchema = z
  .object({
    id: z.string(),
    trajetId: z.string(),
    status: BookingStatusSchema,
    paymentMethod: RidePaymentMethodSchema,
    seats: z.number().int().min(1),
    fareCents: z.number().int().nonnegative(),
    trajet: BookingTrajetSummarySchema,
  })
  .describe('CheckoutBookingSummary');
export type CheckoutBookingSummary = z.infer<typeof CheckoutBookingSummarySchema>;

export const BookingPaymentStateSchema = z
  .object({
    invoice: InvoiceSchema.nullable(),
    payment: PaymentSchema.nullable(),
    creditNote: CreditNoteSchema.nullable(),
    booking: CheckoutBookingSummarySchema.nullable(),
  })
  .describe('BookingPaymentState');
export type BookingPaymentState = z.infer<typeof BookingPaymentStateSchema>;

export const DriverPayoutStatusSchema = z.enum(['held', 'due', 'paid', 'cancelled', 'frozen']);
export type DriverPayoutStatus = z.infer<typeof DriverPayoutStatusSchema>;

export const DriverPayoutSchema = z
  .object({
    id: z.string(),
    bookingId: z.string(),
    driverId: z.string(),
    amountCents: z.number().int().nonnegative(),
    currency: z.string(),
    status: DriverPayoutStatusSchema,
    dueAt: z.string().describe('ISO-8601 timestamp'),
    paidAt: z.string().nullable().describe('ISO-8601 timestamp'),
    paidRef: z.string().nullable(),
    createdAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('DriverPayout');
export type DriverPayout = z.infer<typeof DriverPayoutSchema>;

export const MarkDriverPayoutPaidSchema = z
  .object({
    ref: z.string().trim().min(4).max(200),
  })
  .describe('MarkDriverPayoutPaid');
export type MarkDriverPayoutPaid = z.infer<typeof MarkDriverPayoutPaidSchema>;

/** Driver-facing booking row: invoice due window, latest payment, payout. */
export const DriverBookingSchema = BookingSchema.extend({
  invoiceDueAt: z.string().nullable().describe('ISO-8601 invoice due date, if issued'),
  invoiceTotalCents: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe('Issued invoice total in cents, if any'),
  paymentStatus: PaymentStatusSchema.nullable().describe('Latest payment attempt status, if any'),
  payout: DriverPayoutSchema.nullable(),
}).describe('DriverBooking');
export type DriverBooking = z.infer<typeof DriverBookingSchema>;

export const DriverBookingPageSchema = paginatedSchema(DriverBookingSchema).describe('DriverBookingPage');
