import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Invoice } from '@carpool/schemas';
import { invoiceSeller } from './invoice';

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: currency.toUpperCase() }).format(
    cents / 100,
  );
}

export async function renderInvoicePdf(doc: Invoice): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const seller = invoiceSeller();
  const black = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.35, 0.35, 0.35);

  let y = 740;
  const line = (text: string, size = 11, weight = font) => {
    page.drawText(text, { x: 48, y, size, font: weight, color: black });
    y -= size + 6;
  };

  line(seller.legalName, 18, bold);
  if (seller.address) line(seller.address, 10, font);
  if (seller.gstNumber) line(`GST: ${seller.gstNumber}`, 10, font);
  if (seller.qstNumber) line(`QST: ${seller.qstNumber}`, 10, font);
  y -= 8;
  line(`Invoice ${doc.number}`, 14, bold);
  line(`Status: ${doc.status}`, 11, font);
  line(`Issued: ${doc.issuedAt.slice(0, 10)}`, 11, font);
  line(`Due: ${doc.dueAt.slice(0, 10)}`, 11, font);
  y -= 8;
  line('Bill to', 12, bold);
  line(doc.buyerName, 11, font);
  if (doc.buyerEmail) line(doc.buyerEmail, 11, font);
  y -= 12;
  if (doc.fareCents > 0) {
    line(`Ride fare  ${money(doc.fareCents, doc.currency)}`, 11, font);
  }
  line(`Kouby booking commission  ${money(doc.commissionCents, doc.currency)}`, 11, font);
  line(`Subtotal  ${money(doc.subtotalCents, doc.currency)}`, 11, font);
  for (const tax of doc.taxLines) {
    line(`${tax.label} (${(tax.rate * 100).toFixed(3)}%)  ${money(tax.amountCents, doc.currency)}`, 11, font);
  }
  line(`Total  ${money(doc.totalCents, doc.currency)}`, 13, bold);
  y -= 16;
  page.drawText(
    doc.fareCents > 0
      ? 'The ride fare is collected by Kouby and paid out to the driver after the trip.'
      : 'Ride fare is paid directly to the driver and is not on this invoice.',
    {
      x: 48,
      y,
      size: 9,
      font,
      color: muted,
    },
  );

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
