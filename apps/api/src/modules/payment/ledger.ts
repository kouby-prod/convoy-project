import { randomUUID } from 'crypto';
import type { db } from '../../db/client';
import { ledgerEntry } from '../../db/payment';

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LedgerAccount =
  | 'accounts_receivable'
  | 'processor_clearing'
  | 'revenue'
  | 'tax_payable'
  | 'refunds';

export type LedgerLine = {
  account: LedgerAccount;
  direction: 'debit' | 'credit';
  amountCents: number;
};

/**
 * Append-only journal. Each `txnId` must balance (debits == credits) or the
 * insert is refused — that invariant is what makes reconciliation mechanical.
 */
export async function postLedger(
  tx: DbTx,
  invoiceId: string,
  txnId: string,
  currency: string,
  lines: LedgerLine[],
): Promise<void> {
  const debit = lines
    .filter((line) => line.direction === 'debit')
    .reduce((sum, line) => sum + line.amountCents, 0);
  const credit = lines
    .filter((line) => line.direction === 'credit')
    .reduce((sum, line) => sum + line.amountCents, 0);
  if (debit !== credit) {
    throw new Error(`Unbalanced ledger txn ${txnId}: debit ${debit} credit ${credit}`);
  }
  if (lines.some((line) => line.amountCents <= 0)) {
    throw new Error(`Ledger txn ${txnId} has a non-positive line`);
  }

  await tx.insert(ledgerEntry).values(
    lines.map((line) => ({
      id: randomUUID(),
      txnId,
      invoiceId,
      account: line.account,
      direction: line.direction,
      amountCents: line.amountCents,
      currency,
    })),
  );
}

export function issueLines(subtotalCents: number, taxCents: number): LedgerLine[] {
  const total = subtotalCents + taxCents;
  const lines: LedgerLine[] = [
    { account: 'accounts_receivable', direction: 'debit', amountCents: total },
    { account: 'revenue', direction: 'credit', amountCents: subtotalCents },
  ];
  if (taxCents > 0) {
    lines.push({ account: 'tax_payable', direction: 'credit', amountCents: taxCents });
  }
  return lines;
}

export function payLines(totalCents: number): LedgerLine[] {
  return [
    { account: 'processor_clearing', direction: 'debit', amountCents: totalCents },
    { account: 'accounts_receivable', direction: 'credit', amountCents: totalCents },
  ];
}

export function refundLines(subtotalCents: number, taxCents: number): LedgerLine[] {
  const total = subtotalCents + taxCents;
  const lines: LedgerLine[] = [
    { account: 'revenue', direction: 'debit', amountCents: subtotalCents },
    { account: 'processor_clearing', direction: 'credit', amountCents: total },
  ];
  if (taxCents > 0) {
    lines.push({ account: 'tax_payable', direction: 'debit', amountCents: taxCents });
  }
  return lines;
}
