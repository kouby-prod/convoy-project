'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { UploadCloud } from 'lucide-react';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  DRIVER_DOCUMENT_TYPES,
  type DriverDocumentType,
} from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { submitDocument } from '@/lib/documents';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';

/**
 * The driver's upload form. One document at a time: type, file, and an optional
 * expiry date.
 *
 * State is controlled rather than read from `FormData`, because the file and the
 * Radix select both need to be inspected before submit (size/type are validated
 * in the browser so a bad file fails instantly instead of after the upload).
 */
export function DocumentUploadForm() {
  const t = useTranslations('Documents');
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<DriverDocumentType>('permis');
  const [file, setFile] = useState<File | null>(null);
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState('');

  const maxSizeMb = Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024));

  const mutation = useMutation({
    mutationFn: submitDocument,
    onSuccess: () => {
      // The checklist and the history both read this key.
      queryClient.invalidateQueries({ queryKey: ['my-documents'] });
      setFile(null);
      setExpiresOn('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (cause: unknown) => setError(toMessage(cause)),
  });

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

  return (
    <Card>
      <CardContent className="p-6 pt-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="space-y-2">
            <label htmlFor="document-type" className="block text-sm font-medium text-foreground">
              {t('upload.typeLabel')}
            </label>
            <Select value={type} onValueChange={(value) => setType(value as DriverDocumentType)}>
              <SelectTrigger
                id="document-type"
                className="h-12 rounded-full border-0 bg-card px-5 shadow-sm ring-1 ring-border"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRIVER_DOCUMENT_TYPES.map((documentType) => (
                  <SelectItem key={documentType} value={documentType}>
                    {t(`type.${documentType}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="document-file" className="block text-sm font-medium text-foreground">
              {t('upload.fileLabel')}
            </label>
            <input
              ref={fileInputRef}
              id="document-file"
              type="file"
              accept={DOCUMENT_MIME_TYPES.join(',')}
              onChange={(event) => {
                setError('');
                setFile(event.target.files?.[0] ?? null);
              }}
              className={cn(
                'w-full cursor-pointer rounded-3xl bg-card p-2 text-sm text-muted-foreground shadow-sm ring-1 ring-border outline-none transition-all duration-200',
                'focus-visible:ring-3 focus-visible:ring-ring/30',
                'file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-primary file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-primary-foreground file:transition-all file:duration-200 hover:file:bg-primary/80',
              )}
            />
            <p className="px-1 text-xs text-muted-foreground">
              {t('upload.hint', { max: maxSizeMb })}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="document-expiry" className="block text-sm font-medium text-foreground">
              {t('upload.expiryLabel')}
            </label>
            <Input
              id="document-expiry"
              type="date"
              value={expiresOn}
              onChange={(event) => setExpiresOn(event.target.value)}
            />
          </div>

          {error ? (
            <p className="rounded-3xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={mutation.isPending} className="w-full">
            <UploadCloud className="size-4" strokeWidth={2.5} aria-hidden />
            {mutation.isPending ? t('upload.submitting') : t('upload.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
