'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Loader2 } from 'lucide-react';
import { fetchDocumentViewUrl } from '@/lib/documents';
import { cn } from '@/lib/utils';

/**
 * Opens one document in a new tab.
 *
 * The signed URL is fetched on click rather than up front: it expires in
 * minutes, so one minted at render time would already be dead by the time
 * anyone scrolled down to use it.
 *
 * Lives in its own module because the backoffice queue uses it too, and
 * importing it out of the driver's list component made the review queue depend
 * on a page it has nothing to do with.
 */
export function ViewDocumentLink({ id, label }: { id: string; label: string }) {
  const t = useTranslations('Documents');
  const [isLoading, setIsLoading] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  async function handleClick() {
    setIsLoading(true);
    setHasFailed(false);
    try {
      const url = await fetchDocumentViewUrl(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // A dead or forbidden link is worth saying out loud — silently doing
      // nothing on click reads as a broken button.
      setHasFailed(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold outline-none transition-all duration-200 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60',
        hasFailed ? 'text-destructive' : 'text-primary',
      )}
    >
      {isLoading ? (
        <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} aria-hidden />
      ) : (
        <ExternalLink className="size-3.5" strokeWidth={2.5} aria-hidden />
      )}
      {hasFailed ? t('viewFailed') : label}
    </button>
  );
}
