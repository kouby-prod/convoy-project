import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MIN_DRIVER_AGE, ageOn, type DriverEligibility, type DriverVerification } from '@carpool/schemas';
import { saveMyEligibility, saveMyLicenseNumber, saveMyName } from '@/lib/eligibility';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const VERIFICATION_LABELS: Record<DriverVerification['status'], string> = {
  incomplete: 'Il vous manque un document ou une déclaration.',
  pending: 'Vos documents sont en cours de vérification.',
  rejected: 'Un document a été refusé — corrigez-le puis renvoyez-le.',
  expired: 'Votre permis doit être vérifié à nouveau.',
  approved: 'Votre compte est vérifié.',
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
      setDobError('Indiquez votre date de naissance.');
      return;
    }
    if (ageOn(dateOfBirth) < MIN_DRIVER_AGE) {
      setDobError(`Vous devez avoir ${MIN_DRIVER_AGE} ans ou plus pour conduire.`);
      return;
    }
    dobMutation.mutate();
  }

  return (
    <Card>
      <Text style={styles.title}>Vérification du conducteur</Text>
      <Text style={styles.value}>{VERIFICATION_LABELS[verification.status]}</Text>
      <Text style={styles.progress}>
        {verification.approvedCount}/{verification.requiredCount} approuvé(s)
      </Text>

      <View style={styles.field}>
        <TextField
          label="Date de naissance (AAAA-MM-JJ)"
          value={dateOfBirth}
          onChangeText={(v) => {
            setDateOfBirth(v);
            setDobError(null);
          }}
          placeholder="2000-01-15"
        />
        {dobError ? <Text style={styles.error}>{dobError}</Text> : null}
        {dobMutation.isError ? <Text style={styles.error}>L'enregistrement a échoué.</Text> : null}
        <Button
          label={dobMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          size="sm"
          onPress={handleSaveDob}
          disabled={dobMutation.isPending}
        />
      </View>

      <View style={styles.field}>
        <TextField label="Numéro de permis" value={licenseNumber} onChangeText={setLicenseNumber} />
        {licenseMutation.isError ? <Text style={styles.error}>L'enregistrement a échoué.</Text> : null}
        <Button
          label={licenseMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          size="sm"
          onPress={() => licenseMutation.mutate()}
          disabled={licenseMutation.isPending || !licenseNumber.trim()}
        />
      </View>

      <View style={styles.field}>
        <TextField label="Prénom légal" value={firstName} onChangeText={setFirstName} />
        <TextField label="Nom légal" value={lastName} onChangeText={setLastName} />
        {nameMutation.isError ? <Text style={styles.error}>L'enregistrement a échoué.</Text> : null}
        <Button
          label={nameMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
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
