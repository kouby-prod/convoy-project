import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../db/client';
import { reconciliationMismatch } from '../../db/payment';
import { sendEmail } from '../../auth/email';
import { env } from '../../env';
import { reportOncall } from '../../observability';
import type { ReconciliationMismatch } from '@carpool/schemas';
import { ReconciliationMismatchSchema } from '@carpool/schemas';

export function serializeMismatch(row: typeof reconciliationMismatch.$inferSelect): ReconciliationMismatch {
  return ReconciliationMismatchSchema.parse({
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    providerPaymentId: row.providerPaymentId,
    invoiceId: row.invoiceId,
    detail: row.detail,
    status: row.status === 'resolved' ? 'resolved' : 'open',
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedBy: row.resolvedBy,
  });
}

/**
 * Deduped incident row + one support email on first insert. Reconcile and
 * workers call this instead of console.error-only.
 */
export async function recordPaymentIncident(input: {
  kind: string;
  provider?: string | null;
  providerPaymentId?: string | null;
  invoiceId?: string | null;
  detail?: unknown;
}): Promise<{ id: string; created: boolean }> {
  if (input.providerPaymentId) {
    const [existing] = await db
      .select()
      .from(reconciliationMismatch)
      .where(
        and(
          eq(reconciliationMismatch.kind, input.kind),
          eq(reconciliationMismatch.providerPaymentId, input.providerPaymentId),
          eq(reconciliationMismatch.status, 'open'),
        ),
      )
      .limit(1);
    if (existing) return { id: existing.id, created: false };
  }

  const [row] = await db
    .insert(reconciliationMismatch)
    .values({
      id: randomUUID(),
      kind: input.kind,
      provider: input.provider ?? null,
      providerPaymentId: input.providerPaymentId ?? null,
      invoiceId: input.invoiceId ?? null,
      detail: input.detail ?? {},
      status: 'open',
    })
    .returning();
  if (!row) throw new Error('incident insert returned no row');

  await notifySupport(row.kind, row.id, input.detail).catch((err: unknown) => {
    console.error('[payment] incident email failed', err);
  });
  await reportOncall({
    kind: row.kind,
    incidentId: row.id,
    provider: input.provider,
    providerPaymentId: input.providerPaymentId,
    invoiceId: input.invoiceId,
    detail: input.detail,
  }).catch((err: unknown) => {
    console.error('[payment] on-call report failed', err);
  });
  return { id: row.id, created: true };
}

async function notifySupport(kind: string, incidentId: string, detail: unknown): Promise<void> {
  const to = env.SUPPORT_EMAIL ?? env.EMAIL_FROM;
  const origin = env.TRUSTED_ORIGINS[0] ?? '';
  await sendEmail({
    to,
    subject: `[Kouby] payment incident: ${kind}`,
    text: [
      `A payment incident was recorded.`,
      `Kind: ${kind}`,
      `Id: ${incidentId}`,
      origin ? `Admin: ${origin}/admin` : '',
      `Detail: ${JSON.stringify(detail ?? {}, null, 2)}`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
}
