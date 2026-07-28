'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { ExternalLink, FileText } from 'lucide-react';
import {
  DRIVER_DOCUMENT_TYPES,
  type DriverDocument,
  type DriverDocumentType,
} from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { DocumentStatusBadge } from '@/components/documents/document-status-badge';
import { fetchDocumentViewUrl, fetchMyDocuments } from '@/lib/documents';

/**
 * The driver's own submissions, in two readings of the same data:
 *
 *   - a checklist over the four required types showing the LATEST state of each,
 *     because the question a driver actually has is "am I done?", and
 *   - the full history underneath, since a re-submission creates a new row and
 *     the rejection that prompted it stays worth seeing.
 */
export function MesDocumentsList() {
  const t = useTranslations('Documents');
  const format = useFormatter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-documents'],
    queryFn: fetchMyDocuments,
  });

  if (isLoading) return <StatusCard>{t('loading')}</StatusCard>;
  if (isError) return <StatusCard tone="error">{t('error')}</StatusCard>;

  const documents = data ?? [];
  const latestByType = toLatestByType(documents);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Checklist: one row per required document ─────────────────────── */}
      <Card>
        <CardContent className="p-2 pt-2">
          <h2 className="px-4 py-3 text-sm font-semibold text-muted-foreground">
            {t('checklist.title')}
          </h2>
          <ul className="divide-y divide-border">
            {DRIVER_DOCUMENT_TYPES.map((type) => (
              <li
                key={type}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
              >
                <span className="text-sm font-medium text-foreground">{t(`type.${type}`)}</span>
                <DocumentStatusBadge status={latestByType.get(type)?.status ?? 'missing'} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ── History ──────────────────────────────────────────────────────── */}
      {documents.length === 0 ? (
        <StatusCard>{t('empty')}</StatusCard>
      ) : (
        <Card>
          <CardContent className="p-2 pt-2">
            <h2 className="px-4 py-3 text-sm font-semibold text-muted-foreground">
              {t('history.title')}
            </h2>
            <ul className="divide-y divide-border">
              {documents.map((document) => (
                <li key={document.id} className="flex flex-col gap-2 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText
                        className="size-4 shrink-0 text-muted-foreground"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {t(`type.${document.type}`)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {document.fileName} ·{' '}
                          {format.dateTime(new Date(document.submittedAt), {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <DocumentStatusBadge status={document.status} />
                      <ViewDocumentLink id={document.id} label={t('view')} />
                    </div>
                  </div>

                  {/* The reason is the only thing that makes a rejection actionable. */}
                  {document.status === 'rejected' && document.reviewNote ? (
                    <p className="rounded-3xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
                      {t('history.reason', { reason: document.reviewNote })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Opens a document in a new tab.
 *
 * The signed URL is fetched on click rather than up front: it expires in
 * minutes, so one minted at render time would already be dead by the time
 * anyone scrolled down to use it.
 */
export function ViewDocumentLink({ id, label }: { id: string; label: string }) {
  async function handleClick() {
    const url = await fetchDocumentViewUrl(id);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary outline-none transition-all duration-200 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <ExternalLink className="size-3.5" strokeWidth={2.5} aria-hidden />
      {label}
    </button>
  );
}

function StatusCard({ children, tone }: { children: string; tone?: 'error' }) {
  return (
    <Card>
      <CardContent
        className={
          tone === 'error'
            ? 'p-8 pt-8 text-center text-sm text-destructive'
            : 'p-8 pt-8 text-center text-sm text-muted-foreground'
        }
      >
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Latest submission per type. The API already returns newest first, so the first
 * row seen for a type wins and the older ones are skipped.
 */
function toLatestByType(documents: DriverDocument[]): Map<DriverDocumentType, DriverDocument> {
  const latest = new Map<DriverDocumentType, DriverDocument>();
  for (const document of documents) {
    if (!latest.has(document.type)) latest.set(document.type, document);
  }
  return latest;
}
