'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { FileText, IdCard, Info, RotateCcw, UploadCloud, X } from 'lucide-react';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  type DocumentSlotStatus,
  type DriverDocument,
  type RequiredDriverDocumentType,
} from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DocumentStatusBadge } from '@/components/documents/document-status-badge';
import { submitDocument } from '@/lib/documents';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { ViewDocumentLink } from './view-document-link';

/** One recognisable icon per required document — just the licence today. */
const SLOT_ICONS: Record<RequiredDriverDocumentType, typeof IdCard> = {
  permis: IdCard,
};

export interface DocumentSlotCardProps {
  type: RequiredDriverDocumentType;
  /** The driver's newest submission of this type, or null if they never sent one. */
  latest: DriverDocument | null;
  /**
   * The slot's status as rolled up by `deriveDriverVerification` — NOT
   * `latest.status`. The two differ exactly once: a `permis` approved more
   * than a year ago is still `approved` on the stored document but `expired`
   * here, which is what should drive the badge and the re-upload prompt.
   */
  slotStatus: DocumentSlotStatus;
}

/**
 * One of the two documents the platform asks for, with everything about it in
 * one place: what it is, why it is asked for, where it stands, why it was
 * refused, and the control to (re)send it.
 *
 * Three things here are deliberate rather than decorative:
 *
 *   - the "why" line, because people abandon identity checks that read as
 *     bureaucracy and complete the ones that explain themselves;
 *   - the preview of the chosen file BEFORE submitting, because the whole
 *     failure mode of an ID upload is sending the wrong photo, and a filename
 *     does not catch that;
 *   - a rejected card that looks rejected, because recovering from a refusal is
 *     the path that decides whether a driver finishes at all.
 */
export function DocumentSlotCard({ type, latest, slotStatus }: DocumentSlotCardProps) {
  const t = useTranslations('Documents');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  // Open when there is something to do, closed once the document is in. An
  // approved card that still showed a file picker would read as unfinished.
  const [isOpen, setIsOpen] = useState(
    slotStatus === 'missing' || slotStatus === 'rejected' || slotStatus === 'expired',
  );
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState('');

  const Icon = SLOT_ICONS[type];
  const maxSizeMb = Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024));

  const mutation = useMutation({
    mutationFn: submitDocument,
    onSuccess: () => {
      // The banner, the slots and the history are three readings of this one key.
      queryClient.invalidateQueries({ queryKey: ['my-documents'] });
      reset();
      setIsOpen(false);
    },
    onError: (cause: unknown) => setError(toMessage(cause)),
  });

  function reset() {
    setFile(null);
    setExpiresOn('');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  /** Turn a failure into the one sentence that tells the driver what to change. */
  function toMessage(cause: unknown): string {
    if (isApiError(cause, 413)) return t('upload.tooLarge', { max: maxSizeMb });
    if (isApiError(cause, 415)) return t('upload.unsupported');
    if (isApiError(cause, 401)) return t('authRequired');
    return t('upload.failed');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!file) {
      setError(t('upload.noFile'));
      return;
    }
    mutation.mutate({ type, file, expiresOn });
  }

  /**
   * Drag-and-drop and the file input funnel through here, so both validate
   * alike. Rejecting a too-large file at selection time rather than after the
   * upload is the difference between "that one is 8 MB" and a failure three
   * seconds later with nothing to point at.
   */
  function acceptFile(candidate: File | undefined) {
    setError('');
    if (!candidate) return;
    if (candidate.size > DOCUMENT_MAX_BYTES) {
      setError(t('upload.tooLarge', { max: maxSizeMb }));
      return;
    }
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(candidate.type)) {
      setError(t('upload.unsupported'));
      return;
    }
    setFile(candidate);
  }

  return (
    <Card
      className={cn(
        'transition-all duration-500 ease-smooth',
        slotStatus === 'rejected' && 'ring-destructive/30',
      )}
    >
      <CardContent className="flex flex-col gap-4 p-5 pt-5">
        {/* ── What this slot is, and why we ask ─────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-5" strokeWidth={2.25} aria-hidden />
            </span>
            <div className="min-w-0 space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground">{t(`type.${type}`)}</h3>
              <p className="text-xs text-muted-foreground">{t(`slot.${type}.hint`)}</p>
            </div>
          </div>
          <DocumentStatusBadge status={slotStatus} />
        </div>

        <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
          {t(`slot.${type}.why`)}
        </p>

        {/* ── What is already on file ───────────────────────────────────── */}
        {latest ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2">
            <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <FileText className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              <span className="truncate">
                {latest.fileName} ·{' '}
                {format.dateTime(new Date(latest.submittedAt), {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </p>
            <ViewDocumentLink id={latest.id} label={t('view')} />
          </div>
        ) : null}

        {/* The reason is the only thing that makes a refusal actionable. */}
        {slotStatus === 'rejected' && latest?.reviewNote ? (
          <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {t('history.reason', { reason: latest.reviewNote })}
          </p>
        ) : null}

        {/* ── Send / resend ─────────────────────────────────────────────── */}
        {isOpen ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {file ? (
              <SelectedFile
                file={file}
                onRemove={() => {
                  reset();
                  fileInputRef.current?.focus();
                }}
                removeLabel={t('upload.remove')}
                readyLabel={t('upload.ready')}
              />
            ) : (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  acceptFile(event.dataTransfer.files[0]);
                }}
              >
                {/* The input precedes the label so `peer-focus-visible` can put a
                    ring on the drop zone. Drag-and-drop is an enhancement here,
                    never the only route: the input itself stays keyboard
                    operable, which is what makes this pass WCAG. */}
                <input
                  ref={fileInputRef}
                  id={`file-${fieldId}`}
                  type="file"
                  className="peer sr-only"
                  accept={DOCUMENT_MIME_TYPES.join(',')}
                  onChange={(event) => acceptFile(event.target.files?.[0])}
                />
                <label
                  htmlFor={`file-${fieldId}`}
                  className={cn(
                    'flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-6 text-center transition-all duration-200',
                    'peer-focus-visible:border-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/30',
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:border-primary/50 hover:bg-primary/5',
                  )}
                >
                  <UploadCloud
                    className={cn('size-6', isDragging ? 'text-primary' : 'text-muted-foreground')}
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  <span className="text-sm font-medium text-foreground">
                    {t('upload.dropzone')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('upload.hint', { max: maxSizeMb })}
                  </span>
                </label>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor={`expiry-${fieldId}`}
                className="block text-xs font-medium text-muted-foreground"
              >
                {t('upload.expiryLabel')}
              </label>
              <Input
                id={`expiry-${fieldId}`}
                type="date"
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.target.value)}
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={mutation.isPending || !file} className="flex-1">
                <UploadCloud className="size-4" strokeWidth={2.5} aria-hidden />
                {mutation.isPending ? t('upload.submitting') : t('upload.submit')}
              </Button>
              {/* Only offered when there is something to fall back to — a driver
                  with nothing on file has no state to cancel back into. */}
              {latest ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => {
                    reset();
                    setIsOpen(false);
                  }}
                >
                  {t('upload.cancel')}
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
            <RotateCcw className="size-4" strokeWidth={2.5} aria-hidden />
            {t('upload.replace')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The chosen file, shown back before it is sent.
 *
 * An identity document is exactly the case where picking the wrong file is easy
 * and a filename does not reveal it — `IMG_4821.jpg` looks like every other
 * photo on the phone. The thumbnail is the check, and the remove button is the
 * way out; without one the only escape from a wrong pick is reloading the page.
 */
function SelectedFile({
  file,
  onRemove,
  removeLabel,
  readyLabel,
}: {
  file: File;
  onRemove: () => void;
  removeLabel: string;
  readyLabel: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    // Object URLs are a document-lifetime leak until revoked, and this component
    // remounts on every pick.
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="flex items-center gap-3 rounded-md bg-muted p-3">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card ring-1 ring-border">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <FileText className="size-6 text-muted-foreground" strokeWidth={2} aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-success">{readyLabel}</p>
        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
        <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-all duration-200 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <X className="size-4" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}

/** Bytes as a short "1.4 MB"-style string. */
function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 0.1 ? `${megabytes.toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}
