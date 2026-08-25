'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Check, IdCard, Pencil, UserRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchMyEligibility, saveMyLicenseNumber, saveMyName } from '@/lib/documents';

/**
 * The driver's legal identity — first/last name and licence number — shown
 * together because a reviewer cross-checks the number against the name
 * printed on the licence. Lives on its own here rather than inside
 * `EligibilityPanel`: neither fact is one of `deriveDriverVerification`'s
 * conditions (an unfilled name/number doesn't change verification status),
 * just information this page should surface once it's given — previously,
 * filling in the licence number during ride creation left no trace here,
 * which is what this card fixes.
 */
export function DriverIdentityCard() {
  const t = useTranslations('Documents');
  const eligibilityQuery = useQuery({ queryKey: ['my-eligibility'], queryFn: fetchMyEligibility });

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5 pt-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('identity.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('identity.subtitle')}</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <NameField
            firstName={eligibilityQuery.data?.firstName ?? null}
            lastName={eligibilityQuery.data?.lastName ?? null}
          />
          <LicenseNumberField currentValue={eligibilityQuery.data?.licenseNumber ?? null} />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * First + last name, saved together (`PUT /eligibility/name`). Same
 * collapse-once-set pattern as `DateOfBirthField` in `eligibility-panel.tsx`
 * — a name is a fact the driver sets once, not an always-open form.
 */
function NameField({ firstName, lastName }: { firstName: string | null; lastName: string | null }) {
  const t = useTranslations('Documents');
  const queryClient = useQueryClient();
  const hasValue = firstName !== null && lastName !== null;
  const [isEditing, setIsEditing] = useState(!hasValue);
  const [first, setFirst] = useState(firstName ?? '');
  const [last, setLast] = useState(lastName ?? '');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: saveMyName,
    onSuccess: (saved) => {
      queryClient.setQueryData(['my-eligibility'], saved);
      setIsEditing(false);
      setError('');
    },
    onError: () => setError(t('identity.nameSaveFailed')),
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedFirst = first.trim();
    const trimmedLast = last.trim();
    if (!trimmedFirst || !trimmedLast) {
      setError(t('identity.nameRequired'));
      return;
    }
    setError('');
    mutation.mutate({ firstName: trimmedFirst, lastName: trimmedLast });
  }

  if (!isEditing) {
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="text-xs font-medium text-muted-foreground">{t('identity.nameLabel')}</p>
        <p className="text-sm font-medium text-foreground">
          {firstName} {lastName}
        </p>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-primary outline-none transition-all duration-200 hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <Pencil className="size-3" strokeWidth={2.5} aria-hidden />
          {t('identity.changeName')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <UserRound className="size-3.5" strokeWidth={2.5} aria-hidden />
        {t('identity.nameLabel')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          aria-label={t('identity.firstNameLabel')}
          placeholder={t('identity.firstNameLabel')}
          value={first}
          onChange={(event) => {
            setFirst(event.target.value);
            setError('');
          }}
          maxLength={100}
        />
        <Input
          aria-label={t('identity.lastNameLabel')}
          placeholder={t('identity.lastNameLabel')}
          value={last}
          onChange={(event) => {
            setLast(event.target.value);
            setError('');
          }}
          maxLength={100}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          <Check className="size-4" strokeWidth={2.5} aria-hidden />
          {mutation.isPending ? t('eligibility.saving') : t('eligibility.save')}
        </Button>
        {hasValue ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => {
              setFirst(firstName ?? '');
              setLast(lastName ?? '');
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

/**
 * The licence number — same field the ride-creation checklist saves
 * (`PUT /eligibility/license-number`, shared `['my-eligibility']` cache), now
 * also visible and editable from `/mes-documents`.
 */
function LicenseNumberField({ currentValue }: { currentValue: string | null }) {
  const t = useTranslations('Documents');
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(currentValue === null);
  const [value, setValue] = useState(currentValue ?? '');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: saveMyLicenseNumber,
    onSuccess: (saved) => {
      queryClient.setQueryData(['my-eligibility'], saved);
      setIsEditing(false);
      setError('');
    },
    onError: () => setError(t('identity.licenseNumberSaveFailed')),
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t('identity.licenseNumberRequired'));
      return;
    }
    setError('');
    mutation.mutate(trimmed);
  }

  if (!isEditing) {
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="text-xs font-medium text-muted-foreground">{t('identity.licenseNumberLabel')}</p>
        <p className="text-sm font-medium text-foreground">{currentValue}</p>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-primary outline-none transition-all duration-200 hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <Pencil className="size-3" strokeWidth={2.5} aria-hidden />
          {t('identity.changeLicenseNumber')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label
        htmlFor="mes-documents-license-number"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        <IdCard className="size-3.5" strokeWidth={2.5} aria-hidden />
        {t('identity.licenseNumberLabel')}
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="mes-documents-license-number"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
          maxLength={50}
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
