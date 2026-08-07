'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import type { DriverDocument } from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { DocumentStatusBadge } from '@/components/documents/document-status-badge';
import { ViewDocumentLink } from './view-document-link';

/**
 * Every submission the driver has made, newest first.
 *
 * The slots above answer "where do I stand"; this answers "what have I sent".
 * They are separate because re-sending a refused document creates a NEW row —
 * the slot moves on to the fresh one while the rejection and its reason stay
 * here, which is the only record the driver has of what went wrong.
 *
 * Purely presentational: the panel owns the query, so this never fetches and can
 * never show a different list than the banner counted.
 */
export function MesDocumentsHistory({ documents }: { documents: DriverDocument[] }) {
  const t = useTranslations('Documents');
  const format = useFormatter();

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 pt-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </CardContent>
      </Card>
    );
  }

  return (
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
  );
}
