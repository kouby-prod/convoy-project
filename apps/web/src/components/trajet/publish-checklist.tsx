'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Check, CircleCheck, IdCard, ShieldCheck, X, type LucideIcon } from 'lucide-react';
import type { Vehicle } from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LabelledField } from '@/components/ui/labelled-field';
import { Link } from '@/i18n/navigation';
import { fetchMyEligibility, saveMyLicenseNumber } from '@/lib/documents';
import { fetchMyVehicle, saveMyVehicle } from '@/lib/vehicles';
import { cn } from '@/lib/utils';

export interface PublishChecklistStepProps {
  onPublish: () => void;
  onBack: () => void;
  publishing: boolean;
}

/**
 * Étape 2 — a two-item checklist of what's mandatory before publishing,
 * rather than a second copy of `/mes-documents`' full verification flow
 * (banner, eligibility panel, document upload). The two pages used to overlap
 * almost entirely; this step now only checks the two facts that actually
 * gate publishing:
 *
 *   - the licence NUMBER is on file — the scanned photo stays optional and
 *     lives entirely on `/mes-documents` (linked from here, not duplicated);
 *   - insurance was declared "oui".
 *
 * "Publier" — the action that actually creates the ride — stays disabled
 * until both are checked.
 */
export function PublishChecklistStep({ onPublish, onBack, publishing }: PublishChecklistStepProps) {
  const t = useTranslations('Trajet');

  const eligibilityQuery = useQuery({ queryKey: ['my-eligibility'], queryFn: fetchMyEligibility });
  const vehicleQuery = useQuery({ queryKey: ['my-vehicle'], queryFn: fetchMyVehicle });

  const licenseDone = !!eligibilityQuery.data?.licenseNumber;
  const insuranceDone = vehicleQuery.data?.hasInsurance === true;
  const canPublish = licenseDone && insuranceDone;

  const [error, setError] = useState('');

  function handlePublish() {
    if (!canPublish) {
      setError(t('create.step2.checklist.incomplete'));
      return;
    }
    setError('');
    onPublish();
  }

  return (
    <div className="flex flex-col gap-6">
      <LicenseChecklistItem loading={eligibilityQuery.isLoading} done={licenseDone} />
      <InsuranceChecklistItem
        loading={vehicleQuery.isLoading}
        done={insuranceDone}
        vehicle={vehicleQuery.data ?? null}
      />

      {error ? (
        <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-center">
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          {t('create.step2.back')}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="px-10"
          disabled={!canPublish || publishing}
          onClick={handlePublish}
        >
          {publishing ? t('create.submitting') : t('create.submit')}
        </Button>
      </div>
    </div>
  );
}

/** Icon + title + a green check once the item is satisfied. */
function ChecklistHeader({ Icon, title, done }: { Icon: LucideIcon; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-md',
          done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="size-5" strokeWidth={2.25} aria-hidden />
      </span>
      <h3 className="flex-1 text-sm font-semibold text-foreground">{title}</h3>
      {done ? <CircleCheck className="size-5 shrink-0 text-success" strokeWidth={2} aria-hidden /> : null}
    </div>
  );
}

/**
 * The licence-number checklist item — done once `['my-eligibility']` carries
 * one, regardless of whether the scanned document was ever uploaded. Saved
 * via the same `PUT /eligibility/license-number` as before; the field just
 * lives in a checklist row now instead of behind a "do you have a licence?"
 * gate.
 */
function LicenseChecklistItem({ loading, done }: { loading: boolean; done: boolean }) {
  const t = useTranslations('Trajet');
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: saveMyLicenseNumber,
    onSuccess: (saved) => {
      queryClient.setQueryData(['my-eligibility'], saved);
      setError('');
      setValue('');
    },
    onError: () => setError(t('create.step2.licenseNumber.saveFailed')),
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t('create.step2.licenseNumber.required'));
      return;
    }
    setError('');
    mutation.mutate(trimmed);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 pt-5">
        <ChecklistHeader Icon={IdCard} title={t('create.step2.checklist.licenseTitle')} done={done} />

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('create.step2.verification.loading')}</p>
        ) : done ? (
          <p className="text-sm text-muted-foreground">{t('create.step2.checklist.licenseDone')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <LabelledField label={t('create.step2.licenseNumber.label')} htmlFor="license-number">
              <Input
                id="license-number"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError('');
                }}
                maxLength={50}
                required
              />
            </LabelledField>

            {error ? (
              <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="outline" disabled={mutation.isPending} className="self-start">
              <Check className="size-4" strokeWidth={2.5} aria-hidden />
              {mutation.isPending
                ? t('create.step2.licenseNumber.saving')
                : t('create.step2.licenseNumber.save')}
            </Button>
          </form>
        )}

        <p className="text-xs text-muted-foreground">
          {t('create.step2.checklist.licenseHint')}{' '}
          <Link href="/mes-documents" className="font-medium text-primary hover:underline">
            {t('create.step2.checklist.licenseHintLink')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * The insurance checklist item — done once `vehicle.hasInsurance === true`.
 * "Non" doesn't hard-block the page the way an earlier version of this flow
 * did; it just leaves the item unchecked (and "Publier" disabled), with an
 * inline reminder right where the driver can fix it by picking "Oui".
 */
function InsuranceChecklistItem({
  loading,
  done,
  vehicle,
}: {
  loading: boolean;
  done: boolean;
  vehicle: Vehicle | null;
}) {
  const t = useTranslations('Trajet');
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: saveMyVehicle,
    onSuccess: (saved) => {
      queryClient.setQueryData(['my-vehicle'], saved);
      setError('');
    },
    onError: () => setError(t('create.step4.saveFailed')),
  });

  function choose(value: boolean) {
    if (!vehicle) {
      setError(t('create.step4.missingVehicle'));
      return;
    }
    setError('');
    mutation.mutate({
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      seats: vehicle.seats,
      plate: vehicle.plate,
      hasInsurance: value,
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 pt-5">
        <ChecklistHeader Icon={ShieldCheck} title={t('create.step4.title')} done={done} />

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('create.step2.verification.loading')}</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-foreground">{t('create.step4.question')}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant={vehicle?.hasInsurance === true ? 'primary' : 'outline'}
                disabled={mutation.isPending}
                onClick={() => choose(true)}
              >
                <Check className="size-4" strokeWidth={2.5} aria-hidden />
                {t('create.yes')}
              </Button>
              <Button
                type="button"
                variant={vehicle?.hasInsurance === false ? 'primary' : 'outline'}
                disabled={mutation.isPending}
                onClick={() => choose(false)}
              >
                <X className="size-4" strokeWidth={2.5} aria-hidden />
                {t('create.no')}
              </Button>
            </div>
            {vehicle?.hasInsurance === false ? (
              <p className="text-sm text-destructive">{t('create.step4.blockedBody')}</p>
            ) : null}
          </>
        )}

        {error ? (
          <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
