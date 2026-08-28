import { COMMISSION_AMOUNT_CENTS, PRODUCT_TAX_MODE, commissionTaxCents } from './payment';
import type { RidePaymentMethod } from './trajet';

export { COMMISSION_AMOUNT_CENTS };

/**
 * Booking-price composition shared by web and mobile (both previously
 * reimplemented this function-for-function in their own `lib/booking-money.ts`
 * — a pricing-rule change risked landing on one platform and silently
 * diverging on the other).
 */

/** Commission + Quebec tax, without the ride fare. */
export function koubyFeeCents(): number {
  return COMMISSION_AMOUNT_CENTS + commissionTaxCents(PRODUCT_TAX_MODE);
}

/** Amount Kouby charges now: fare + commission + tax on card, commission + tax otherwise. */
export function koubyDueCents(method: RidePaymentMethod, fareCents: number): number {
  const koubyCents = koubyFeeCents();
  return method === 'card' ? fareCents + koubyCents : koubyCents;
}

/** Prefer the issued invoice total (includes tax) over the tax-blind estimate. */
export function payableCents(
  invoiceTotalCents: number | null | undefined,
  method: RidePaymentMethod,
  fareCents: number,
): number {
  return invoiceTotalCents ?? koubyDueCents(method, fareCents);
}

/** Ride fare still owed to the driver after the Kouby charge (Interac/cash). */
export function driverFareCents(method: RidePaymentMethod, fareCents: number): number {
  return method === 'card' ? 0 : fareCents;
}

/** `locale` follows next-intl's `useLocale()` on web / this app's `Locale` on mobile — both are just `'fr' | 'en'` strings. */
export function formatCad(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-CA' : 'fr-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

export function isPastDue(dueAt: string | null | undefined): boolean {
  if (!dueAt) return false;
  const due = Date.parse(dueAt);
  return Number.isFinite(due) && due <= Date.now();
}

/** Live clock for the pay window — `4:32`, then hours once over an hour. */
export function remainingDueLabel(dueAt: string, now = Date.now()): string | null {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return null;
  const ms = due - now;
  if (ms <= 0) return null;
  const totalSec = Math.max(1, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours >= 1) {
    return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function remainingDueMs(dueAt: string, now = Date.now()): number | null {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return null;
  return due - now;
}
