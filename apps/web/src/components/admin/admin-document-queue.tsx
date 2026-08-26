'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronUp, FileText, X } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
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
import { ADMIN_FILTER_TRIGGER, AdminFilterBar, AdminQueueState, AdminSearch } from './admin-queue-state';

const ANY = 'any';

type StatusFilter = DocumentStatus | typeof ANY;

/**
 * Review queue as list-detail: compact file list, selected submission as a
 * case pane. j/k (or next/prev) moves between files.
 */
export function AdminDocumentQueue({
  initialQuery = '',
  initialStatus = 'pending',
}: {
  initialQuery?: string;
  initialStatus?: StatusFilter;
}) {
  const t = useTranslations('Admin');
  const tDocument = useTranslations('Documents');
  const format = useFormatter();

  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [type, setType] = useState<DriverDocumentType | typeof ANY>(ANY);
  const [search, setSearch] = useState(initialQuery);
  const [submittedSearch, setSubmittedSearch] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query: AdminDocumentQuery = {
    ...(status === ANY ? {} : { status }),
    ...(type === ANY ? {} : { type }),
    ...(submittedSearch ? { q: submittedSearch } : {}),
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'documents', query],
    queryFn: () => fetchAdminDocuments(query),
    retry: false,
  });

  const items = data ?? [];
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined;

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]!.id);
    }
  }, [items, selectedId]);

  const move = useCallback(
    (delta: number) => {
      setSelectedId((current) => {
        if (!items.length) return current;
        const index = items.findIndex((item) => item.id === current);
        const from = index < 0 ? 0 : index;
        const next = Math.min(items.length - 1, Math.max(0, from + delta));
        return items[next]!.id;
      });
    },
    [items],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
        return;
      }
      if (event.key === 'j') {
        event.preventDefault();
        move(1);
      }
      if (event.key === 'k') {
        event.preventDefault();
        move(-1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <AdminFilterBar>
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger className={ADMIN_FILTER_TRIGGER} aria-label={t('filters.status')}>
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

          <Select value={type} onValueChange={(value) => setType(value as DriverDocumentType | typeof ANY)}>
            <SelectTrigger className={ADMIN_FILTER_TRIGGER} aria-label={t('filters.type')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t('filters.allTypes')}</SelectItem>
              {REQUIRED_DRIVER_DOCUMENT_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {tDocument(`type.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AdminSearch
            value={search}
            onChange={setSearch}
            onSubmit={() => setSubmittedSearch(search.trim())}
            placeholder={t('filters.searchPlaceholder')}
            label={t('filters.search')}
          />
      </AdminFilterBar>

      <AdminQueueState
        isLoading={isLoading}
        isError={isError}
        empty={!items.length}
        loadingLabel={t('loading')}
        errorLabel={t('error')}
        emptyLabel={t('queue.empty')}
        retryLabel={t('retry')}
        onRetry={() => void refetch()}
      >
        <div className="flex min-h-[28rem] flex-1 overflow-hidden rounded-lg bg-muted/40 ring-1 ring-foreground/10 lg:min-h-0">
          <aside
            className={cn(
              'flex w-full shrink-0 flex-col border-border lg:w-80 lg:border-r',
              selectedId ? 'hidden lg:flex' : 'flex',
            )}
          >
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {items.map((document) => (
                <li key={document.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(document.id)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-all duration-200',
                      'focus-visible:ring-3 focus-visible:ring-ring/30',
                      document.id === selectedId
                        ? 'bg-primary/15 ring-1 ring-inset ring-primary/25'
                        : 'hover:bg-muted/60',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {document.owner.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {tDocument(`type.${document.type}`)}
                        {' · '}
                        {format.dateTime(new Date(document.submittedAt), {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </span>
                    <DocumentStatusBadge status={document.status} />
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className={cn('min-w-0 flex-1 flex-col', selectedId ? 'flex' : 'hidden lg:flex')}>
            {selected ? (
              <DocumentCase
                key={selected.id}
                document={selected}
                canPrev={selectedIndex > 0}
                canNext={selectedIndex < items.length - 1}
                onPrev={() => move(-1)}
                onNext={() => move(1)}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <p className="m-auto p-6 text-center text-sm text-muted-foreground">{t('queue.select')}</p>
            )}
          </section>
        </div>
      </AdminQueueState>
    </div>
  );
}

function DocumentCase({
  document,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onBack,
}: {
  document: AdminDocument;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('Admin');
  const tDocument = useTranslations('Documents');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [isRejecting, setIsRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const isLicence = document.type === 'permis';
  const { age } = document.owner.verification;
  const submittedOn = format.dateTime(new Date(document.submittedAt), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const mutation = useMutation({
    mutationFn: reviewDocument,
    onSuccess: () => {
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
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="lg:hidden"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" strokeWidth={2.25} />
          <span className="sr-only">{t('queue.back')}</span>
        </Button>
        <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground lg:block">
          {t('queue.shortcut')}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" disabled={!canPrev} onClick={onPrev} aria-label={t('queue.previous')}>
            <ChevronUp className="size-4" strokeWidth={2.25} />
          </Button>
          <Button size="sm" variant="outline" disabled={!canNext} onClick={onNext} aria-label={t('queue.next')}>
            <ChevronDown className="size-4" strokeWidth={2.25} />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{document.owner.name}</p>
                <VerificationChip verification={document.owner.verification} />
              </div>
              <p className="truncate text-xs text-muted-foreground">{document.owner.email}</p>
            </div>
            <SlotSummary verification={document.owner.verification} />
          </div>

          <div className="flex flex-col gap-3 rounded-md bg-muted p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
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
            <DocumentPreview
              id={document.id}
              mimeType={document.mimeType}
              fileName={document.fileName}
              defaultOpen
            />
          </div>

          {document.status === 'rejected' && document.reviewNote ? (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {t('queue.currentReason', { reason: document.reviewNote })}
            </p>
          ) : null}

          {isRejecting ? (
            <div className="flex flex-col gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
              <label htmlFor={`reject-note-${document.id}`} className="text-sm font-medium text-foreground">
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
                    mutation.isPending || document.status === 'approved' || (isLicence && !ageConfirmed)
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
        </div>
      </div>
    </div>
  );
}

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
