'use client';

import { useTranslations } from 'next-intl';
import { BadgeCheck, Clock, FileWarning, ShieldAlert } from 'lucide-react';
import type { DriverVerification, DriverVerificationStatus } from '@carpool/schemas';
import { cn } from '@/lib/utils';

/**
 * The one-line answer to "am I done?", above the upload slots.
 *
 * Each state gets its own icon, colour and sentence. Colour alone is not enough
 * — it fails colour-blind users and is easy to miss when scanning — so every
 * state is encoded three ways at once (icon + tint + wording), which is the
 * combination that measures fastest to recognise.
 *
 * The segmented bar is the second half of that: multi-step verification flows
 * lose people when the remaining work is invisible, so "how many left" is shown
 * as position, not only as a number.
 */
const BANNER_STYLES: Record<
  DriverVerificationStatus,
  { Icon: typeof BadgeCheck; wrapper: string; icon: string; fill: string }
> = {
  incomplete: {
    Icon: FileWarning,
    wrapper: 'bg-card ring-border',
    icon: 'text-muted-foreground',
    fill: 'bg-muted-foreground/30',
  },
  pending: {
    Icon: Clock,
    wrapper: 'bg-warning/20 ring-warning-foreground/10',
    icon: 'text-warning-foreground',
    fill: 'bg-warning',
  },
  rejected: {
    Icon: ShieldAlert,
    wrapper: 'bg-destructive/8 ring-destructive/20',
    icon: 'text-destructive',
    fill: 'bg-destructive',
  },
  approved: {
    Icon: BadgeCheck,
    wrapper: 'bg-success/10 ring-success/25',
    icon: 'text-success',
    fill: 'bg-success',
  },
};

/** Per-segment tint, so the bar says WHICH document is where. */
const SEGMENT_FILL = {
  missing: 'bg-border',
  pending: 'bg-warning',
  approved: 'bg-success',
  rejected: 'bg-destructive',
} as const;

export function VerificationBanner({ verification }: { verification: DriverVerification }) {
  const t = useTranslations('Documents');
  const { status, slots, approvedCount, requiredCount } = verification;
  const { Icon, wrapper, icon } = BANNER_STYLES[status];

  return (
    <section
      aria-label={t('verification.label')}
      className={cn(
        'flex flex-col gap-4 rounded-md px-5 py-4 shadow-sm ring-1 transition-all duration-500 ease-smooth sm:flex-row sm:items-center sm:gap-5',
        wrapper,
      )}
    >
      <span className={cn('shrink-0', icon)}>
        <Icon className="size-7" strokeWidth={2} aria-hidden />
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-base font-semibold text-foreground">
          {t(`verification.${status}.title`)}
        </p>
        <p className="text-sm text-muted-foreground">{t(`verification.${status}.body`)}</p>
      </div>

      {/* Progress as position + count. One segment per required document, in the
          same order as the cards below, so the bar maps onto them. */}
      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {t('verification.progress', { approved: approvedCount, total: requiredCount })}
        </p>
        <div className="flex gap-1" aria-hidden>
          {slots.map((slot) => (
            <span
              key={slot.type}
              className={cn(
                'h-1.5 w-10 rounded-full transition-colors duration-500 ease-smooth',
                SEGMENT_FILL[slot.status],
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
