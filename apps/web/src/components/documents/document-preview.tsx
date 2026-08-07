'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronDown, Eye } from 'lucide-react';
import { fetchDocumentViewUrl } from '@/lib/documents';
import { cn } from '@/lib/utils';

export interface DocumentPreviewProps {
  id: string;
  mimeType: string;
  fileName: string;
}

/**
 * The document itself, expandable in place.
 *
 * A reviewer decides on a photo of an ID card: whether it is legible, whether
 * the name matches, whether it has expired. Doing that through "open in a new
 * tab" costs a tab and a context switch per document, and the queue is exactly
 * where those add up. The signed URL renders `inline` (see `createViewUrl`), so
 * both supported shapes can be shown directly.
 *
 * Fetched only once expanded, and never cached: the URL is signed for minutes,
 * so a reused one would be a broken image rather than a fast one.
 */
export function DocumentPreview({ id, mimeType, fileName }: DocumentPreviewProps) {
  const t = useTranslations('Admin');
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['document-file', id],
    queryFn: () => fetchDocumentViewUrl(id),
    enabled: isOpen,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary outline-none transition-all duration-200 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <Eye className="size-3.5" strokeWidth={2.5} aria-hidden />
        {isOpen ? t('queue.hidePreview') : t('queue.showPreview')}
        <ChevronDown
          className={cn('size-3.5 transition-transform duration-200', isOpen && 'rotate-180')}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>

      {isOpen ? (
        // `bg-card`, not `bg-muted`: this sits inside a muted well, and a
        // checkerboard behind a transparent PNG needs to be a plain surface.
        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          {isLoading ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{t('loading')}</p>
          ) : isError || !data ? (
            <p className="p-8 text-center text-sm text-destructive">{t('queue.previewFailed')}</p>
          ) : isImage ? (
            /* Plain <img>: the src is a presigned, short-lived URL on the storage
               host. next/image would proxy and cache bytes that are deliberately
               neither cacheable nor public, and the signature expires anyway. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data}
              alt={fileName}
              className="mx-auto max-h-[28rem] w-full object-contain"
            />
          ) : isPdf ? (
            <iframe src={data} title={fileName} className="h-[28rem] w-full border-0" />
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {t('queue.previewUnsupported')}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
