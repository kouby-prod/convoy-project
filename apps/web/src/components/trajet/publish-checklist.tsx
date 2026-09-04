'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Check, CircleCheck, IdCard, X, type LucideIcon } from 'lucide-react';
import {
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  deriveDriverVerification,
  type DriverDocument,
  type DriverEligibility,
  type EligibilityConfirmation,
  type RequiredDriverDocumentType,
  type Vehicle,
} from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LabelledField } from '@/components/ui/labelled-field';
import { DocumentSlotCard } from '@/components/mes-documents/document-slot-card';
import {
  fetchMyDocuments,
  fetchMyEligibility,
  saveMyEligibilityConfirmation,
  saveMyLicenseNumber,
  saveMyName,
} from '@/lib/documents';
import { fetchMyVehicle, saveMyVehicle } from '@/lib/vehicles';
import { useSessionDraft } from '@/hooks/use-session-draft';
import { cn } from '@/lib/utils';
import { CardSkeleton } from '@/components/ui/list-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * First/last name + licence number, folded into "Publier" — see
 * `handlePublish` — rather than each having its own save button like
 * `DriverIdentityCard` (used as-is on /mes-documents).
 */
interface IdentityDraft {
  firstName: string;
  lastName: string;
  licenseNumber: string;
  seeded: boolean;
}

const EMPTY_IDENTITY_DRAFT: IdentityDraft = { firstName: '', lastName: '', licenseNumber: '', seeded: false };
const IDENTITY_DRAFT_KEY = 'trajet-create-identity-draft';

export interface PublishChecklistStepProps {
  onPublish: () => void;
  onBack: () => void;
  publishing: boolean;
}

/**
 * Étape 2 — the same eligibility and licence sections shown on
 * `/mes-documents`, reused here rather than duplicated, plus the insurance
 * question. Driver identity (name + licence number) is entered inline and
 * saved together with everything else when "Publier" is clicked — no
 * separate "Enregistrer" button, unlike `DriverIdentityCard` (used as-is on
 * /mes-documents). The licence NUMBER and an insurance answer of "oui" are
 * what gate "Publier"; the scanned licence photo and the date of birth stay
 * optional at this step, same as everywhere else they appear.
 */
export function PublishChecklistStep({ onPublish, onBack, publishing }: PublishChecklistStepProps) {
  const t = useTranslations('Trajet');
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({ queryKey: ['my-documents'], queryFn: fetchMyDocuments });
  const eligibilityQuery = useQuery({ queryKey: ['my-eligibility'], queryFn: fetchMyEligibility });
  const vehicleQuery = useQuery({ queryKey: ['my-vehicle'], queryFn: fetchMyVehicle });

  const [identityDraft, setIdentityDraft] = useSessionDraft<IdentityDraft>(IDENTITY_DRAFT_KEY, EMPTY_IDENTITY_DRAFT);

  function updateIdentityDraft(patch: Partial<IdentityDraft>) {
    setIdentityDraft((current) => ({ ...current, ...patch }));
  }

  // Seed once the driver's existing name/licence number (if any) has loaded.
  useEffect(() => {
    if (identityDraft.seeded || !eligibilityQuery.data) return;
    updateIdentityDraft({
      firstName: eligibilityQuery.data.firstName ?? '',
      lastName: eligibilityQuery.data.lastName ?? '',
      licenseNumber: eligibilityQuery.data.licenseNumber ?? '',
      seeded: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityDraft.seeded, eligibilityQuery.data]);

  const insuranceDone = vehicleQuery.data?.hasInsurance === true;
  const eligibilityConfirmed =
    eligibilityQuery.data?.hasValidLicense === true && eligibilityQuery.data?.meetsRequirements === true;
  // Whether it's even worth trying: the licence NUMBER isn't saved yet at
  // this point (only on "Publier", below), so this reads the draft rather
  // than the (still stale) query — insurance/eligibility already save
  // per-click, so those two do reflect live state.
  const canAttemptPublish = identityDraft.licenseNumber.trim().length > 0 && insuranceDone && eligibilityConfirmed;

  const nameMutation = useMutation({ mutationFn: saveMyName });
  const licenseMutation = useMutation({ mutationFn: saveMyLicenseNumber });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handlePublish() {
    setError('');

    const trimmedLicense = identityDraft.licenseNumber.trim();
    if (!trimmedLicense) {
      setError(t('create.step2.checklist.licenseRequired'));
      return;
    }

    setIsSaving(true);
    let saved: DriverEligibility;
    try {
      saved = await licenseMutation.mutateAsync(trimmedLicense);
      queryClient.setQueryData(['my-eligibility'], saved);

      const trimmedFirst = identityDraft.firstName.trim();
      const trimmedLast = identityDraft.lastName.trim();
      if (trimmedFirst && trimmedLast) {
        saved = await nameMutation.mutateAsync({ firstName: trimmedFirst, lastName: trimmedLast });
        queryClient.setQueryData(['my-eligibility'], saved);
      }
    } catch {
      setError(t('create.step2.checklist.saveFailed'));
      setIsSaving(false);
      return;
    }
    setIsSaving(false);

    if (!saved.licenseNumber || !insuranceDone || saved.hasValidLicense !== true || saved.meetsRequirements !== true) {
      setError(t('create.step2.checklist.incomplete'));
      return;
    }

    onPublish();
  }

  const documents = documentsQuery.data ?? [];
  const latestByType = toLatestByType(documents);
  const verification = deriveDriverVerification(documents, {
    dateOfBirth: eligibilityQuery.data?.dateOfBirth ?? null,
  });
  const slotStatusByType = new Map(verification.slots.map((slot) => [slot.type, slot.status]));
  const isLoadingDriverInfo = documentsQuery.isLoading || eligibilityQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      {/* Two columns above `lg` rather than one long stack — identity and
          eligibility read together on the left, the licence card and the
          insurance question (the two things that actually gate "Publier")
          together on the right. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          {isLoadingDriverInfo ? (
            <CardSkeleton rows={3} label={t('create.step2.verification.loading')} />
          ) : (
            <>
              <IdentityFieldsCard draft={identityDraft} updateDraft={updateIdentityDraft} />
              <EligibilityConfirmationCard
                eligibilityLoading={eligibilityQuery.isLoading}
                eligibility={eligibilityQuery.data ?? null}
                vehicleLoading={vehicleQuery.isLoading}
                vehicle={vehicleQuery.data ?? null}
              />
            </>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {isLoadingDriverInfo
            ? <CardSkeleton rows={3} label={t('create.step2.verification.loading')} />
            : REQUIRED_DRIVER_DOCUMENT_TYPES.map((type) => (
                <DocumentSlotCard
                  key={type}
                  type={type}
                  latest={latestByType.get(type) ?? null}
                  slotStatus={slotStatusByType.get(type) ?? 'missing'}
                />
              ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" onClick={onBack}>
          {t('create.step2.back')}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="w-full px-10 sm:w-auto"
          disabled={!canAttemptPublish || publishing || isSaving}
          onClick={handlePublish}
        >
          {isSaving ? t('create.step1.saving') : publishing ? t('create.submitting') : t('create.submit')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Driver identity — first/last name and licence number, shown together
 * because a reviewer cross-checks the number against the name printed on the
 * licence. Plain inputs bound to `IdentityDraft`, no save button of their
 * own: `PublishChecklistStep.handlePublish` saves both fields right before
 * publishing.
 */
function IdentityFieldsCard({
  draft,
  updateDraft,
}: {
  draft: IdentityDraft;
  updateDraft: (patch: Partial<IdentityDraft>) => void;
}) {
  const t = useTranslations('Documents');

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5 pt-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('identity.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('identity.subtitle')}</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <LabelledField label={t('identity.nameLabel')} htmlFor="create-identity-firstname">
            <div className="grid grid-cols-2 gap-2">
              <Input
                id="create-identity-firstname"
                aria-label={t('identity.firstNameLabel')}
                placeholder={t('identity.firstNameLabel')}
                value={draft.firstName}
                onChange={(event) => updateDraft({ firstName: event.target.value })}
                maxLength={100}
              />
              <Input
                aria-label={t('identity.lastNameLabel')}
                placeholder={t('identity.lastNameLabel')}
                value={draft.lastName}
                onChange={(event) => updateDraft({ lastName: event.target.value })}
                maxLength={100}
              />
            </div>
          </LabelledField>
          <LabelledField label={t('identity.licenseNumberLabel')} htmlFor="create-identity-license-number">
            <Input
              id="create-identity-license-number"
              value={draft.licenseNumber}
              onChange={(event) => updateDraft({ licenseNumber: event.target.value })}
              maxLength={50}
              required
            />
          </LabelledField>
        </div>
      </CardContent>
    </Card>
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
 * The "Conditions d'éligibilité" step, reduced to the three things that
 * actually gate "Publier" — a valid Canadian licence, valid insurance, and
 * meeting every other requirement to drive in Canada — each a self-declared
 * yes/no, all together in one card for readability. The licence and
 * requirements answers are saved together through
 * `saveMyEligibilityConfirmation` (`driver_eligibility`); insurance is its
 * own field on `vehicle` (`saveMyVehicle`), so it has its own mutation, but
 * reads the same as the other two here.
 */
function EligibilityConfirmationCard({
  eligibilityLoading,
  eligibility,
  vehicleLoading,
  vehicle,
}: {
  eligibilityLoading: boolean;
  eligibility: DriverEligibility | null;
  vehicleLoading: boolean;
  vehicle: Vehicle | null;
}) {
  const t = useTranslations('Trajet');
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const hasValidLicense = eligibility?.hasValidLicense ?? null;
  const meetsRequirements = eligibility?.meetsRequirements ?? null;
  const hasInsurance = vehicle?.hasInsurance ?? null;
  const done = hasValidLicense === true && hasInsurance === true && meetsRequirements === true;

  const eligibilityMutation = useMutation({
    mutationFn: saveMyEligibilityConfirmation,
    onSuccess: (saved) => {
      queryClient.setQueryData(['my-eligibility'], saved);
      setError('');
    },
    onError: () => setError(t('create.step5.saveFailed')),
  });

  const insuranceMutation = useMutation({
    mutationFn: saveMyVehicle,
    onSuccess: (saved) => {
      queryClient.setQueryData(['my-vehicle'], saved);
      setError('');
    },
    onError: () => setError(t('create.step5.saveFailed')),
  });

  function chooseEligibility(patch: Partial<EligibilityConfirmation>) {
    setError('');
    eligibilityMutation.mutate({
      hasValidLicense: patch.hasValidLicense ?? hasValidLicense ?? false,
      meetsRequirements: patch.meetsRequirements ?? meetsRequirements ?? false,
    });
  }

  function chooseInsurance(value: boolean) {
    if (!vehicle) {
      setError(t('create.step5.missingVehicle'));
      return;
    }
    setError('');
    insuranceMutation.mutate({
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      seats: vehicle.seats,
      plate: vehicle.plate,
      hasInsurance: value,
    });
  }

  const loading = eligibilityLoading || vehicleLoading;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 pt-5">
        <ChecklistHeader Icon={IdCard} title={t('create.step5.title')} done={done} />

        {loading ? (
          <Skeleton className="h-11 w-full" />
        ) : (
          <>
            <YesNoQuestion
              question={t('create.step5.licenseQuestion')}
              value={hasValidLicense}
              disabled={eligibilityMutation.isPending}
              onChoose={(value) => chooseEligibility({ hasValidLicense: value })}
            />
            <YesNoQuestion
              question={t('create.step5.insuranceQuestion')}
              value={hasInsurance}
              disabled={insuranceMutation.isPending}
              onChoose={chooseInsurance}
            />
            <YesNoQuestion
              question={t('create.step5.requirementsQuestion')}
              value={meetsRequirements}
              disabled={eligibilityMutation.isPending}
              onChoose={(value) => chooseEligibility({ meetsRequirements: value })}
            />
            {hasValidLicense === false || hasInsurance === false || meetsRequirements === false ? (
              <p className="text-sm text-destructive">{t('create.step5.blockedBody')}</p>
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

/** One self-declared yes/no question — the shared shape behind both eligibility questions. */
function YesNoQuestion({
  question,
  value,
  disabled,
  onChoose,
}: {
  question: string;
  value: boolean | null;
  disabled: boolean;
  onChoose: (value: boolean) => void;
}) {
  const t = useTranslations('Trajet');

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">{question}</p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant={value === true ? 'primary' : 'outline'}
          disabled={disabled}
          onClick={() => onChoose(true)}
        >
          <Check className="size-4" strokeWidth={2.5} aria-hidden />
          {t('create.yes')}
        </Button>
        <Button
          type="button"
          variant={value === false ? 'primary' : 'outline'}
          disabled={disabled}
          onClick={() => onChoose(false)}
        >
          <X className="size-4" strokeWidth={2.5} aria-hidden />
          {t('create.no')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Newest submission per required type. Same rule `deriveDriverVerification`
 * applies internally (the API returns newest first, so the first row seen for
 * a type wins), so a slot's badge here always matches its status.
 */
function toLatestByType(
  documents: DriverDocument[],
): Map<RequiredDriverDocumentType, DriverDocument> {
  const latest = new Map<RequiredDriverDocumentType, DriverDocument>();
  for (const document of documents) {
    const type = REQUIRED_DRIVER_DOCUMENT_TYPES.find((required) => required === document.type);
    if (type && !latest.has(type)) latest.set(type, document);
  }
  return latest;
}
