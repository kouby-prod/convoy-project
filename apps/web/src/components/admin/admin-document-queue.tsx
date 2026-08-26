'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { CalendarDays, Check, FileText, Search, X } from 'lucide-react';
import {
  DOCUMENT_STATUSES,
  MIN_DRIVER_AGE,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  type AdminDocument,
  type AdminDocumentQuery,
  type DocumentStatus,
  type DriverDocumentType,
  type DriverVerification,
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
import {
  DocumentStatusBadge,
  DOCUMENT_STATUS_STYLES,
} from '@/components/documents/document-status-badge';
import { DocumentPreview } from '@/components/documents/document-preview';
import { VerificationChip } from '@/components/documents/verification-chip';
import { ViewDocumentLink } from '@/components/mes-documents/view-document-link';
import { fetchAdminDocuments, reviewDocument } from '@/lib/admin';
import { cn } from '@/lib/utils';

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
              {/* Only the types a driver can still submit. The legacy ones are
                  renderable but nobody sends them, so they would be dead
                  options in a filter. */}
              {REQUIRED_DRIVER_DOCUMENT_TYPES.map((value) => (
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
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [isRejecting, setIsRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  // Only a licence carries a birth date, so only a licence can settle the
  // minimum-age rule. The API refuses to approve one without this confirmation;
  // the checkbox is how the reviewer gives it, and gating the button here means
  // they are never bounced by a 400 they could not have anticipated.
  const isLicence = document.type === 'permis';
  const { age } = document.owner.verification;

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
    /* Three zones, in the order a decision is actually made: WHO is this driver,
       WHAT am I looking at, and only then the decision. The previous single
       column mixed all three and put the driver's overall progress under the
       filename, where it read as a property of the file rather than the person. */
    <li className="flex flex-col gap-4 px-4 py-5">
      {/* ── Zone 1: who ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{document.owner.name}</p>
            {/* Approving this file may or may not complete the driver, and the
                row should not make the reviewer guess which. */}
            <VerificationChip verification={document.owner.verification} />
          </div>
          <p className="truncate text-xs text-muted-foreground">{document.owner.email}</p>
        </div>

        <SlotSummary verification={document.owner.verification} />
      </div>

      {/* ── Zone 2: what is being judged ──────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-md bg-muted p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <FileText
              className="size-4 shrink-0 text-muted-foreground"
              strokeWidth={2.25}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {tDocument(`type.${document.type}`)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {document.fileName} · {submittedOn}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <DocumentStatusBadge status={document.status} />
            <ViewDocumentLink id={document.id} label={t('queue.view')} />
          </div>
        </div>

        {/* On its own line rather than in the cluster above: expanded, the image
            needs the full width of the well, not a flex item's share of it. */}
        <DocumentPreview
          id={document.id}
          mimeType={document.mimeType}
          fileName={document.fileName}
        />
      </div>

      {/* The reviewer's existing decision, so a re-review has context. */}
      {document.status === 'rejected' && document.reviewNote ? (
        <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {t('queue.currentReason', { reason: document.reviewNote })}
        </p>
      ) : null}

      {/* ── Zone 3: the decision ──────────────────────────────────────── */}
      {isRejecting ? (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
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
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={mutation.isPending} onClick={handleReject}>
              {mutation.isPending ? t('queue.submitting') : t('queue.confirmReject')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => {
                setError('');
                setIsRejecting(false);
              }}
            >
              {t('queue.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* The minimum-age check, on the only document that can answer it. */}
          {isLicence && document.status !== 'approved' ? (
            <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                {age.dateOfBirth
                  ? t('queue.declaredBirthDate', {
                      date: format.dateTime(new Date(`${age.dateOfBirth}T00:00:00`), {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      }),
                      age: age.age ?? 0,
                    })
                  : t('queue.noBirthDate')}
              </p>

              <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  disabled={!age.dateOfBirth}
                  onChange={(event) => {
                    setAgeConfirmed(event.target.checked);
                    setError('');
                  }}
                  className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
                />
                {t('queue.confirmAge', { min: MIN_DRIVER_AGE })}
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {error ? (
              <p role="alert" className="mr-auto text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                setError('');
                setIsRejecting(true);
              }}
            >
              <X className="size-4" strokeWidth={2.5} aria-hidden />
              {t('queue.reject')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={
                mutation.isPending ||
                document.status === 'approved' ||
                (isLicence && !ageConfirmed)
              }
              onClick={() =>
                mutation.mutate({
                  id: document.id,
                  status: 'approved',
                  ...(isLicence ? { ageConfirmed: true } : {}),
                })
              }
            >
              <Check className="size-4" strokeWidth={2.5} aria-hidden />
              {t('queue.approve')}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Both required documents at a glance, so the reviewer can see what is still
 * outstanding without leaving the row or searching for the driver again.
 *
 * These were coloured dots. A dot encodes status in colour and nothing else,
 * which is unreadable to a colour-blind reviewer and easy to skip past for
 * everyone else — and at 6px it was low-contrast on top of that. Each slot now
 * carries the status icon, its tint AND the translated word, the same triple the
 * badge uses, so nothing depends on distinguishing amber from green.
 */
function SlotSummary({ verification }: { verification: DriverVerification }) {
  const tDocument = useTranslations('Documents');

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {verification.slots.map((slot) => {
        const { Icon, tone } = DOCUMENT_STATUS_STYLES[slot.status];
        return (
          <li key={slot.type} className="flex items-center gap-1.5 text-xs">
            <Icon className={cn('size-3.5 shrink-0', tone)} strokeWidth={2.5} aria-hidden />
            <span className="text-muted-foreground">{tDocument(`type.${slot.type}`)}</span>
            <span className={cn('font-semibold', tone)}>{tDocument(`status.${slot.status}`)}</span>
          </li>
        );
      })}
    </ul>
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
