// The actual pricing math lives in packages/schemas/src/booking-money.ts,
// shared with apps/mobile — re-exported here so existing `@/lib/booking-money`
// imports across this app don't need to change.
export {
  COMMISSION_AMOUNT_CENTS,
  koubyFeeCents,
  koubyDueCents,
  payableCents,
  driverFareCents,
  formatCad,
  isPastDue,
  remainingDueLabel,
  remainingDueMs,
} from '@carpool/schemas';
