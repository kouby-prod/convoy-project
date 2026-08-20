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
export const COMMISSION_AMOUNT_CENTS = 500;
export const COMMISSION_CURRENCY = 'cad';

export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export const TaxModeSchema = z.enum(['none', 'gst', 'gst_qst']);
export type TaxMode = z.infer<typeof TaxModeSchema>;

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
  })
  .describe('CreatePayment');
export type CreatePayment = z.infer<typeof CreatePaymentSchema>;

export const CheckoutResponseSchema = z
  .object({
    provider: PaymentProviderSchema,
    clientSecret: z.string().nullable(),
    orderId: z.string().nullable(),
    invoice: InvoiceSchema,
  })
  .describe('CheckoutResponse');
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const CapturePayPalSchema = z
  .object({
    orderId: z.string().min(1),
  })
  .describe('CapturePayPal');
export type CapturePayPal = z.infer<typeof CapturePayPalSchema>;

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

export const DriverPayoutStatusSchema = z.enum(['held', 'due', 'paid', 'cancelled']);
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
    ref: z.string().trim().max(200).optional(),
  })
  .describe('MarkDriverPayoutPaid');
export type MarkDriverPayoutPaid = z.infer<typeof MarkDriverPayoutPaidSchema>;

/** Driver-facing booking row: invoice due window + payout, if any. */
export const DriverBookingSchema = BookingSchema.extend({
  invoiceDueAt: z.string().nullable().describe('ISO-8601 invoice due date, if issued'),
  payout: DriverPayoutSchema.nullable(),
}).describe('DriverBooking');
export type DriverBooking = z.infer<typeof DriverBookingSchema>;

export const DriverBookingPageSchema = paginatedSchema(DriverBookingSchema).describe('DriverBookingPage');
