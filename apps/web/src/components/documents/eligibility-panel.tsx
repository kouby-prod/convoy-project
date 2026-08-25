'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { CalendarDays, Check, Pencil } from 'lucide-react';
import {
  MIN_DRIVER_AGE,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  ageOn,
  type DriverVerification,
} from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DOCUMENT_STATUS_STYLES } from '@/components/documents/document-status-badge';
import { saveMyEligibility } from '@/lib/documents';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';

/**
 * The eligibility rules, stated and scored.
 *
 * The conditions are the actual product requirement, so the page shows them
 * as the requirement — not as an inferred by-product of an upload card. Each
 * line is the rule in plain language next to whether this driver meets it,
 * which is also what makes the age condition visible at all: being 18 is not
 * a file, so without this panel it would have no home on the page.
 */
export function EligibilityPanel({ verification }: { verification: DriverVerification }) {
  const t = useTranslations('Documents');

  const slotByType = new Map(verification.slots.map((slot) => [slot.type, slot.status]));

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-2 pt-2">
        <h2 className="px-3 pt-2 pb-1 text-sm font-semibold text-foreground">
          {t('eligibility.title')}
        </h2>
        <p className="px-3 pb-2 text-xs text-muted-foreground">{t('eligibility.subtitle')}</p>

        <ul className="divide-y divide-border">
          {/* The documentary condition(s), scored from their slot. */}
          {REQUIRED_DRIVER_DOCUMENT_TYPES.map((type) => (
            <ConditionRow
              key={type}
              label={t(`eligibility.condition.${type}`)}
              status={slotByType.get(type) ?? 'missing'}
            />
          ))}

          {/* The fourth: declared by the driver, confirmed by a reviewer. */}
          <AgeConditionRow verification={verification} />
        </ul>
      </CardContent>
    </Card>
  );
}

/** One rule and whether it is met, with icon + tint + word so nothing rides on colour. */
function ConditionRow({
  label,
  status,
  children,
}: {
  label: string;
  status: keyof typeof DOCUMENT_STATUS_STYLES;
  children?: React.ReactNode;
}) {
  const t = useTranslations('Documents');
  const { Icon, tone } = DOCUMENT_STATUS_STYLES[status];

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className={cn('size-4 shrink-0', tone)} strokeWidth={2.5} aria-hidden />
          <span className="text-sm text-foreground">{label}</span>
        </div>
        <span className={cn('shrink-0 text-xs font-semibold', tone)}>{t(`status.${status}`)}</span>
      </div>
      {children}
    </li>
  );
}

/**
 * The minimum-age rule.
 *
 * Reads `approved` only once BOTH halves hold: the driver declared a date of
 * birth that clears the minimum, and a reviewer confirmed it against the
 * licence. A declaration nobody checked is shown as pending, not as met.
 */
function AgeConditionRow({ verification }: { verification: DriverVerification }) {
  const t = useTranslations('Documents');
  const format = useFormatter();
  const { age } = verification;

  const status = !age.dateOfBirth
    ? ('missing' as const)
    : !age.isAdult
      ? ('rejected' as const)
      : age.confirmedByReviewer
        ? ('approved' as const)
        : ('pending' as const);

  return (
    <ConditionRow label={t('eligibility.condition.age', { min: MIN_DRIVER_AGE })} status={status}>
      <div className="pl-6.5">
        {age.dateOfBirth ? (
          <p className="text-xs text-muted-foreground">
            {t('eligibility.bornOn', {
              date: format.dateTime(new Date(`${age.dateOfBirth}T00:00:00`), {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
              age: age.age ?? 0,
            })}
          </p>
        ) : null}
        <DateOfBirthField currentValue={age.dateOfBirth} />
      </div>
    </ConditionRow>
  );
}

/**
 * The one editable field on this panel.
 *
 * Collapsed to a link once a date is on record, because it is a fact the driver
 * sets once — an always-open date input next to three upload cards reads as a
 * fourth thing to do every visit.
 */
function DateOfBirthField({ currentValue }: { currentValue: string | null }) {
  const t = useTranslations('Documents');
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(currentValue === null);
  const [value, setValue] = useState(currentValue ?? '');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: saveMyEligibility,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-eligibility'] });
      setIsEditing(false);
      setError('');
    },
    onError: (cause: unknown) =>
      setError(isApiError(cause, 400) ? t('eligibility.tooYoung', { min: MIN_DRIVER_AGE }) : t('eligibility.saveFailed')),
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!value) {
      setError(t('eligibility.required'));
      return;
    }
    // Checked here so the driver hears it immediately; the API enforces the same
    // rule and is what actually decides.
    if (ageOn(value) < MIN_DRIVER_AGE) {
      setError(t('eligibility.tooYoung', { min: MIN_DRIVER_AGE }));
      return;
    }
    mutation.mutate(value);
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-primary outline-none transition-all duration-200 hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <Pencil className="size-3" strokeWidth={2.5} aria-hidden />
        {t('eligibility.change')}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      <label
        htmlFor="date-of-birth"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        <CalendarDays className="size-3.5" strokeWidth={2.5} aria-hidden />
        {t('eligibility.dateOfBirthLabel')}
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="date-of-birth"
          type="date"
          value={value}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
          className="max-w-52"
        />
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          <Check className="size-4" strokeWidth={2.5} aria-hidden />
          {mutation.isPending ? t('eligibility.saving') : t('eligibility.save')}
        </Button>
        {currentValue ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => {
              setValue(currentValue);
              setError('');
              setIsEditing(false);
            }}
          >
            {t('upload.cancel')}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
