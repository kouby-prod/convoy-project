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

/**
 * Split the 5 CAD commission into subtotal + tax according to TAX_MODE.
 * Rates are applied on the commission, then rounded to the nearest cent.
 */
export function computeInvoiceAmounts(mode: TaxMode = currentTaxMode()): {
  subtotalCents: number;
  taxLines: TaxLine[];
  taxCents: number;
  totalCents: number;
} {
  const subtotalCents = COMMISSION_AMOUNT_CENTS;
  const taxLines: TaxLine[] = [];

  if (mode === 'gst' || mode === 'gst_qst') {
    taxLines.push({
      code: 'gst',
      label: 'GST',
      rate: GST_RATE,
      amountCents: Math.round(subtotalCents * GST_RATE),
    });
  }
  if (mode === 'gst_qst') {
    taxLines.push({
      code: 'qst',
      label: 'QST',
      rate: QST_RATE,
      amountCents: Math.round(subtotalCents * QST_RATE),
    });
  }

  const taxCents = taxLines.reduce((sum, line) => sum + line.amountCents, 0);
  return { subtotalCents, taxLines, taxCents, totalCents: subtotalCents + taxCents };
}
