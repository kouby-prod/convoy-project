import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMyVehicle, saveMyVehicle } from '@/lib/vehicles';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState } from '@/components/ui/StateMessage';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

/**
 * Vehicle declaration — mobile counterpart of the web's ride-creation "Étape 3"
 * vehicle step. One vehicle per driver: `plate` is the only mandatory field,
 * everything else is optional and self-declared (no reviewed upload, unlike
 * `/documents`). Reachable from "Compte" rather than a tab — declared once,
 * then rarely touched.
 */
export default function VehicleScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-vehicle'],
    queryFn: fetchMyVehicle,
  });

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [seats, setSeats] = useState('');
  const [plate, setPlate] = useState('');
  const [hasInsurance, setHasInsurance] = useState<boolean | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setMake(data.make ?? '');
    setModel(data.model ?? '');
    setColor(data.color ?? '');
    setSeats(data.seats !== null ? String(data.seats) : '');
    setPlate(data.plate);
    setHasInsurance(data.hasInsurance);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      saveMyVehicle({
        make: make.trim() || null,
        model: model.trim() || null,
        color: color.trim() || null,
        seats: seats.trim() ? Number(seats) : null,
        plate: plate.trim(),
        hasInsurance,
      }),
    onSuccess: (vehicle) => {
      queryClient.setQueryData(['my-vehicle'], vehicle);
    },
  });

  function handleSubmit() {
    setFieldError(null);
    if (!plate.trim()) {
      setFieldError(t('vehicle.plateRequired'));
      return;
    }
    if (seats.trim() && (!Number.isFinite(Number(seats)) || Number(seats) < 1 || Number(seats) > 8)) {
      setFieldError(t('vehicle.invalidSeats'));
      return;
    }
    mutation.mutate();
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <LoadingState label={t('vehicle.loading')} />
      </ScreenContainer>
    );
  }

  if (isError) {
    return (
      <ScreenContainer>
        <ErrorState label={t('vehicle.error')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.title}>{t('vehicle.title')}</Text>
          <Text style={styles.subtitle}>{t('vehicle.subtitle')}</Text>

          <TextField label={t('vehicle.make')} value={make} onChangeText={setMake} />
          <TextField label={t('vehicle.model')} value={model} onChangeText={setModel} />
          <TextField label={t('vehicle.color')} value={color} onChangeText={setColor} />
          <TextField label={t('vehicle.seats')} value={seats} onChangeText={setSeats} keyboardType="number-pad" />
          <TextField label={t('vehicle.plate')} value={plate} onChangeText={setPlate} />

          <Text style={styles.label}>{t('vehicle.insuranceLabel')}</Text>
          <Button
            label={hasInsurance === true ? t('vehicle.yesChecked') : t('vehicle.yes')}
            size="sm"
            variant={hasInsurance === true ? 'primary' : 'outline'}
            onPress={() => setHasInsurance(true)}
          />
          <Button
            label={hasInsurance === false ? t('vehicle.noChecked') : t('vehicle.no')}
            size="sm"
            variant={hasInsurance === false ? 'primary' : 'outline'}
            onPress={() => setHasInsurance(false)}
          />

          {fieldError ? <Text style={styles.error}>{fieldError}</Text> : null}
          {mutation.isError ? <Text style={styles.error}>{t('vehicle.saveFailed')}</Text> : null}
          {mutation.isSuccess ? <Text style={styles.success}>{t('vehicle.saved')}</Text> : null}

          <Button
            label={mutation.isPending ? t('vehicle.saving') : t('vehicle.save')}
            onPress={handleSubmit}
            loading={mutation.isPending}
          />
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  subtitle: { fontSize: fontSize.sm, color: colors.mutedForeground },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.foreground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  success: { fontSize: fontSize.sm, color: colors.secondary },
});
