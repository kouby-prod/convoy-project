import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MIN_DRIVER_AGE, ageOn, type DriverEligibility, type DriverVerification } from '@carpool/schemas';
import { saveMyEligibility, saveMyLicenseNumber, saveMyName } from '@/lib/eligibility';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { useI18n, type MessageKey } from '@/lib/i18n';

const VERIFICATION_LABEL_KEYS: Record<DriverVerification['status'], MessageKey> = {
  incomplete: 'eligibility.verification.incomplete',
  pending: 'eligibility.verification.pending',
  rejected: 'eligibility.verification.rejected',
  expired: 'eligibility.verification.expired',
  approved: 'eligibility.verification.approved',
};

/**
 * The three eligibility declarations (date of birth, licence number, legal
 * name) plus a one-line verification status — mobile counterpart of the
 * web's `EligibilityPanel` + `VerificationBanner`, condensed into one card.
 */
export function EligibilityCard({
  verification,
  eligibility,
}: {
  verification: DriverVerification;
  eligibility: DriverEligibility;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [dateOfBirth, setDateOfBirth] = useState(eligibility.dateOfBirth ?? '');
  const [dobError, setDobError] = useState<string | null>(null);
  const [licenseNumber, setLicenseNumber] = useState(eligibility.licenseNumber ?? '');
  const [firstName, setFirstName] = useState(eligibility.firstName ?? '');
  const [lastName, setLastName] = useState(eligibility.lastName ?? '');

  useEffect(() => {
    setDateOfBirth(eligibility.dateOfBirth ?? '');
    setLicenseNumber(eligibility.licenseNumber ?? '');
    setFirstName(eligibility.firstName ?? '');
    setLastName(eligibility.lastName ?? '');
  }, [eligibility]);

  function onSaved(updated: DriverEligibility) {
    queryClient.setQueryData(['my-eligibility'], updated);
  }

  const dobMutation = useMutation({
    mutationFn: () => saveMyEligibility(dateOfBirth),
    onSuccess: onSaved,
  });
  const licenseMutation = useMutation({
    mutationFn: () => saveMyLicenseNumber(licenseNumber.trim()),
    onSuccess: onSaved,
  });
  const nameMutation = useMutation({
    mutationFn: () => saveMyName({ firstName: firstName.trim(), lastName: lastName.trim() }),
    onSuccess: onSaved,
  });

  function handleSaveDob() {
    setDobError(null);
    if (!dateOfBirth) {
      setDobError(t('eligibility.dobRequired'));
      return;
    }
    if (ageOn(dateOfBirth) < MIN_DRIVER_AGE) {
      setDobError(t('eligibility.minAge', { age: MIN_DRIVER_AGE }));
      return;
    }
    dobMutation.mutate();
  }

  return (
    <Card>
      <Text style={styles.title}>{t('eligibility.title')}</Text>
      <Text style={styles.value}>{t(VERIFICATION_LABEL_KEYS[verification.status])}</Text>
      <Text style={styles.progress}>
        {t('eligibility.progress', { approved: verification.approvedCount, required: verification.requiredCount })}
      </Text>

      <View style={styles.field}>
        <TextField
          label={t('eligibility.dobLabel')}
          value={dateOfBirth}
          onChangeText={(v) => {
            setDateOfBirth(v);
            setDobError(null);
          }}
          placeholder="2000-01-15"
        />
        {dobError ? <Text style={styles.error}>{dobError}</Text> : null}
        {dobMutation.isError ? <Text style={styles.error}>{t('eligibility.saveFailed')}</Text> : null}
        <Button
          label={dobMutation.isPending ? t('eligibility.saving') : t('eligibility.save')}
          size="sm"
          onPress={handleSaveDob}
          disabled={dobMutation.isPending}
        />
      </View>

      <View style={styles.field}>
        <TextField label={t('eligibility.licenseLabel')} value={licenseNumber} onChangeText={setLicenseNumber} />
        {licenseMutation.isError ? <Text style={styles.error}>{t('eligibility.saveFailed')}</Text> : null}
        <Button
          label={licenseMutation.isPending ? t('eligibility.saving') : t('eligibility.save')}
          size="sm"
          onPress={() => licenseMutation.mutate()}
          disabled={licenseMutation.isPending || !licenseNumber.trim()}
        />
      </View>

      <View style={styles.field}>
        <TextField label={t('eligibility.firstNameLabel')} value={firstName} onChangeText={setFirstName} />
        <TextField label={t('eligibility.lastNameLabel')} value={lastName} onChangeText={setLastName} />
        {nameMutation.isError ? <Text style={styles.error}>{t('eligibility.saveFailed')}</Text> : null}
        <Button
          label={nameMutation.isPending ? t('eligibility.saving') : t('eligibility.save')}
          size="sm"
          onPress={() => nameMutation.mutate()}
          disabled={nameMutation.isPending || !firstName.trim() || !lastName.trim()}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  value: { fontSize: fontSize.sm, color: colors.foreground },
  progress: { fontSize: fontSize.xs, color: colors.mutedForeground },
  field: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: radius.md,
  },
  error: { fontSize: fontSize.xs, color: colors.destructive },
});
