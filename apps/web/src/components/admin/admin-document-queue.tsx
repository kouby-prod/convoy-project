'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Check, Search, X } from 'lucide-react';
import {
  DOCUMENT_STATUSES,
  DRIVER_DOCUMENT_TYPES,
  type AdminDocument,
  type AdminDocumentQuery,
  type DocumentStatus,
  type DriverDocumentType,
} from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DocumentStatusBadge } from '@/components/documents/document-status-badge';
import { ViewDocumentLink } from '@/components/mes-documents/mes-documents-list';
import { fetchAdminDocuments, reviewDocument } from '@/lib/admin';

/** Sentinel for the "no filter" option — a Radix SelectItem cannot hold ''. */
const ANY = 'any';

const triggerClass = 'h-12 rounded-full border-0 bg-card px-5 shadow-sm ring-1 ring-border';

/**
 * The review queue: filters on top, one row per submission underneath.
 *
 * Filter state is local rather than in the URL. Unlike the public ride search, a
 * reviewer's half-finished filter is not something anyone shares a link to.
 */
export function AdminDocumentQueue() {
  const t = useTranslations('Admin');
  // Type and status labels come from the driver-facing namespace on purpose:
  // one wording for "Refusé", whichever side of the review is reading it.
  const tDocument = useTranslations('Documents');
  const format = useFormatter();

  // Defaults to `pending`, because that is the only bucket that means work.
  const [status, setStatus] = useState<DocumentStatus | typeof ANY>('pending');
  const [type, setType] = useState<DriverDocumentType | typeof ANY>(ANY);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');

  const query: AdminDocumentQuery = {
    ...(status === ANY ? {} : { status }),
    ...(type === ANY ? {} : { type }),
    ...(submittedSearch ? { q: submittedSearch } : {}),
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'documents', query],
    queryFn: () => fetchAdminDocuments(query),
    retry: false,
  });

  return (
    <div className="flex flex-col gap-5">
      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="grid gap-3 p-4 pt-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
          <Select value={status} onValueChange={(v) => setStatus(v as DocumentStatus | typeof ANY)}>
            <SelectTrigger className={triggerClass} aria-label={t('filters.status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t('filters.allStatuses')}</SelectItem>
              {DOCUMENT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {tDocument(`status.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={type} onValueChange={(v) => setType(v as DriverDocumentType | typeof ANY)}>
            <SelectTrigger className={triggerClass} aria-label={t('filters.type')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t('filters.allTypes')}</SelectItem>
              {DRIVER_DOCUMENT_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {tDocument(`type.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSubmittedSearch(search.trim());
            }}
            className="flex gap-2"
          >
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('filters.searchPlaceholder')}
              aria-label={t('filters.search')}
            />
            <Button type="submit" variant="outline" size="icon" aria-label={t('filters.search')}>
              <Search className="size-4" strokeWidth={2.5} aria-hidden />
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Queue ────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <StatusCard>{t('loading')}</StatusCard>
      ) : isError ? (
        <StatusCard tone="error">{t('error')}</StatusCard>
      ) : !data?.length ? (
        <StatusCard>{t('queue.empty')}</StatusCard>
      ) : (
        <Card>
          <CardContent className="p-2 pt-2">
            <ul className="divide-y divide-border">
              {data.map((document) => (
                <QueueRow
                  key={document.id}
                  document={document}
                  submittedOn={format.dateTime(new Date(document.submittedAt), {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * One submission, with its decision controls.
 *
 * Rejecting expands a reason field instead of firing immediately: the contract
 * refuses a rejection without a note, so asking for it up front is the only way
 * the button can succeed.
 */
function QueueRow({ document, submittedOn }: { document: AdminDocument; submittedOn: string }) {
  const t = useTranslations('Admin');
  const tDocument = useTranslations('Documents');
  const queryClient = useQueryClient();
  const [isRejecting, setIsRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: reviewDocument,
    onSuccess: () => {
      // The queue and the counters both move on a decision.
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setIsRejecting(false);
      setNote('');
    },
    onError: () => setError(t('queue.reviewFailed')),
  });

  function handleReject() {
    setError('');
    if (!note.trim()) {
      setError(t('queue.reasonRequired'));
      return;
    }
    mutation.mutate({ id: document.id, status: 'rejected', note: note.trim() });
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-semibold text-foreground">{document.owner.name}</p>
          <p className="truncate text-xs text-muted-foreground">{document.owner.email}</p>
          <p className="truncate text-xs text-muted-foreground">
            {tDocument(`type.${document.type}`)} · {document.fileName} · {submittedOn}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DocumentStatusBadge status={document.status} />
          <ViewDocumentLink id={document.id} label={t('queue.view')} />

          <Button
            size="sm"
            variant="primary"
            disabled={mutation.isPending || document.status === 'approved'}
            onClick={() => mutation.mutate({ id: document.id, status: 'approved' })}
          >
            <Check className="size-4" strokeWidth={2.5} aria-hidden />
            {t('queue.approve')}
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              setError('');
              setIsRejecting((open) => !open);
            }}
          >
            <X className="size-4" strokeWidth={2.5} aria-hidden />
            {t('queue.reject')}
          </Button>
        </div>
      </div>

      {/* The reviewer's existing decision, so a re-review has context. */}
      {document.status === 'rejected' && document.reviewNote ? (
        <p className="rounded-3xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          {t('queue.currentReason', { reason: document.reviewNote })}
        </p>
      ) : null}

      {isRejecting ? (
        <div className="flex flex-col gap-2 rounded-3xl bg-muted/60 p-4">
          <label
            htmlFor={`reject-note-${document.id}`}
            className="text-sm font-medium text-foreground"
          >
            {t('queue.reasonLabel')}
          </label>
          <Textarea
            id={`reject-note-${document.id}`}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('queue.reasonPlaceholder')}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={mutation.isPending} onClick={handleReject}>
              {mutation.isPending ? t('queue.submitting') : t('queue.confirmReject')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsRejecting(false)}>
              {t('queue.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </li>
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
