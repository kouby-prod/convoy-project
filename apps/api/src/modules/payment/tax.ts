import {
  COMMISSION_AMOUNT_CENTS,
  GST_RATE,
  QST_RATE,
  type TaxLine,
  type TaxMode,
} from '@carpool/schemas';
import { env } from '../../env';

export function currentTaxMode(): TaxMode {
  return env.TAX_MODE;
}

export function fareCentsFromPrice(pricePerSeat: string | number, seats: number): number {
  return Math.round(Number(pricePerSeat) * 100) * seats;
}

/**
 * Split commission (+ optional ride fare) according to TAX_MODE.
 * Tax is applied on the commission only — the fare is a pass-through.
 */
export function computeInvoiceAmounts(
  fareCents = 0,
  mode: TaxMode = currentTaxMode(),
): {
  fareCents: number;
  commissionCents: number;
  subtotalCents: number;
  taxLines: TaxLine[];
  taxCents: number;
  totalCents: number;
} {
  const commissionCents = COMMISSION_AMOUNT_CENTS;
  const taxLines: TaxLine[] = [];

  if (mode === 'gst' || mode === 'gst_qst') {
    taxLines.push({
      code: 'gst',
      label: 'GST',
      rate: GST_RATE,
      amountCents: Math.round(commissionCents * GST_RATE),
    });
  }
  if (mode === 'gst_qst') {
    taxLines.push({
      code: 'qst',
      label: 'QST',
      rate: QST_RATE,
      amountCents: Math.round(commissionCents * QST_RATE),
    });
  }

  const taxCents = taxLines.reduce((sum, line) => sum + line.amountCents, 0);
  const subtotalCents = commissionCents + fareCents;
  return {
    fareCents,
    commissionCents,
    subtotalCents,
    taxLines,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}
