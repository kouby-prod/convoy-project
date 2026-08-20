import { COMMISSION_AMOUNT_CENTS, type RidePaymentMethod } from '@carpool/schemas';

export { COMMISSION_AMOUNT_CENTS };

/** Amount Kouby charges now: fare + commission on card, commission only otherwise. */
export function koubyDueCents(method: RidePaymentMethod, fareCents: number): number {
  return method === 'card' ? fareCents + COMMISSION_AMOUNT_CENTS : COMMISSION_AMOUNT_CENTS;
}

/** Ride fare still owed to the driver after the Kouby charge (Interac/cash). */
export function driverFareCents(method: RidePaymentMethod, fareCents: number): number {
  return method === 'card' ? 0 : fareCents;
}

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

export function remainingDueLabel(dueAt: string, now = Date.now()): string | null {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return null;
  const ms = due - now;
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.max(1, Math.round((ms % 3_600_000) / 60_000));
  if (hours >= 1) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}
