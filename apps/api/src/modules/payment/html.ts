import type { Invoice } from '@carpool/schemas';
import { invoiceSeller } from './invoice';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: currency.toUpperCase() }).format(
    cents / 100,
  );
}

/** Printable HTML fallback when the PDF cannot be downloaded. */
export function renderInvoiceHtml(doc: Invoice): string {
  const seller = invoiceSeller();
  const taxRows = doc.taxLines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.label)} (${(line.rate * 100).toFixed(3)}%)</td><td>${money(line.amountCents, doc.currency)}</td></tr>`,
    )
    .join('');
  const gst = seller.gstNumber ? `<p>GST: ${escapeHtml(seller.gstNumber)}</p>` : '';
  const qst = seller.qstNumber ? `<p>QST: ${escapeHtml(seller.qstNumber)}</p>` : '';
  const address = seller.address ? `<p>${escapeHtml(seller.address)}</p>` : '';

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(doc.number)}</title>
  <style>
    body { font-family: Georgia, serif; color: #1a1a1a; max-width: 720px; margin: 40px auto; padding: 0 24px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    td { padding: 8px 0; border-bottom: 1px solid #ddd; }
    td:last-child { text-align: right; }
    .muted { color: #555; font-size: 13px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(seller.legalName)}</h1>
  ${address}${gst}${qst}
  <h2>Invoice ${escapeHtml(doc.number)}</h2>
  <p>Status: ${escapeHtml(doc.status)}</p>
  <p>Issued: ${escapeHtml(doc.issuedAt.slice(0, 10))} · Due: ${escapeHtml(doc.dueAt.slice(0, 10))}</p>
  <h3>Bill to</h3>
  <p>${escapeHtml(doc.buyerName)}</p>
  ${doc.buyerEmail ? `<p>${escapeHtml(doc.buyerEmail)}</p>` : ''}
  <table>
    <tr><td>Kouby booking commission</td><td>${money(doc.subtotalCents, doc.currency)}</td></tr>
    ${taxRows}
    <tr><td><strong>Total</strong></td><td><strong>${money(doc.totalCents, doc.currency)}</strong></td></tr>
  </table>
  <p class="muted">Ride fare is paid directly to the driver and is not on this invoice.</p>
</body>
</html>`;
}
