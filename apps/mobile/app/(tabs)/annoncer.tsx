import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import type { RidePaymentMethod, TrajetAmenity } from '@carpool/schemas';
import { RIDE_PAYMENT_METHODS } from '@carpool/schemas';
import { api } from '@/lib/api-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { AMENITY_LABEL_KEYS, AMENITY_ORDER } from '@/lib/amenities';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n, type MessageKey } from '@/lib/i18n';

type Comfort = 'standard' | 'confort' | 'premium';

const COMFORT_OPTIONS: { value: Comfort; labelKey: MessageKey }[] = [
  { value: 'standard', labelKey: 'annoncer.comfortStandard' },
  { value: 'confort', labelKey: 'annoncer.comfortConfort' },
  { value: 'premium', labelKey: 'annoncer.comfortPremium' },
];

const PAYMENT_METHOD_LABEL_KEYS: Record<RidePaymentMethod, MessageKey> = {
  card: 'common.paymentMethod.card',
  interac: 'common.paymentMethod.interac',
  cash: 'common.paymentMethod.cash',
};

interface FormState {
  departureCity: string;
  destinationCity: string;
  date: string;
  time: string;
  seatsTotal: string;
  pricePerSeat: string;
  comfort: Comfort;
  baggageAllowance: string;
  description: string;
  amenities: TrajetAmenity[];
  hasIntermediateStop: boolean;
  paymentMethods: RidePaymentMethod[];
}

const EMPTY_FORM: FormState = {
  departureCity: '',
  destinationCity: '',
  date: '',
  time: '',
  seatsTotal: '1',
  pricePerSeat: '0',
  comfort: 'standard',
  baggageAllowance: '',
  description: '',
  amenities: [],
  hasIntermediateStop: false,
  paymentMethods: [],
};

/**
 * Driver-side "publish a trajet" form (`POST /trajets`) — the mobile
 * counterpart to `apps/web/src/components/annoncer/annoncer-list.tsx`. No
 * native date/time picker this pass (to avoid a new dependency): departure
 * date and time are two plain text fields, combined into an ISO string,
 * mirroring the free-text date filter already used on the search screen.
 */
export default function AnnoncerScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAmenity(amenity: TrajetAmenity) {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  }

  function togglePaymentMethod(method: RidePaymentMethod) {
    setForm((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter((m) => m !== method)
        : [...prev.paymentMethods, method],
    }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const departureDateTime = new Date(`${form.date}T${form.time}`).toISOString();
      const res = await api.trajets.$post({
        json: {
          departureCity: form.departureCity.trim(),
          destinationCity: form.destinationCity.trim(),
          departureDateTime,
          seatsTotal: Math.max(1, Math.trunc(Number(form.seatsTotal) || 1)),
          pricePerSeat: Math.max(0, Number(form.pricePerSeat) || 0),
          comfort: form.comfort,
          baggageAllowance: form.baggageAllowance.trim() || undefined,
          description: form.description.trim() || undefined,
          amenities: form.amenities,
          hasIntermediateStop: form.hasIntermediateStop,
          paymentMethods: form.paymentMethods,
        },
      });
      if (!res.ok) throw new Error(t('annoncer.genericError'));
      return res.json();
    },
    onSuccess: (data) => {
      setForm(EMPTY_FORM);
      router.push(`/trajets/${data.id}`);
    },
  });

  function handleSubmit() {
    setFieldError(null);

    if (!form.departureCity.trim() || !form.destinationCity.trim() || !form.date || !form.time) {
      setFieldError(t('annoncer.missingFields'));
      return;
    }
    if (form.departureCity.trim().toLowerCase() === form.destinationCity.trim().toLowerCase()) {
      setFieldError(t('annoncer.sameCities'));
      return;
    }
    const departureDate = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(departureDate.getTime()) || departureDate <= new Date()) {
      setFieldError(t('annoncer.pastDate'));
      return;
    }
    if (!Number.isFinite(Number(form.seatsTotal)) || Number(form.seatsTotal) < 1) {
      setFieldError(t('annoncer.invalidSeats'));
      return;
    }
    if (!Number.isFinite(Number(form.pricePerSeat)) || Number(form.pricePerSeat) < 0) {
      setFieldError(t('annoncer.invalidPrice'));
      return;
    }
    if (form.paymentMethods.length === 0) {
      setFieldError(t('annoncer.noPaymentMethod'));
      return;
    }

    mutation.mutate();
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('annoncer.title')}</Text>

        <TextField
          label={t('annoncer.departureCity')}
          value={form.departureCity}
          onChangeText={(v) => updateField('departureCity', v)}
        />
        <TextField
          label={t('annoncer.destinationCity')}
          value={form.destinationCity}
          onChangeText={(v) => updateField('destinationCity', v)}
        />
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <TextField
              label={t('annoncer.date')}
              value={form.date}
              onChangeText={(v) => updateField('date', v)}
              placeholder="2026-08-15"
            />
          </View>
          <View style={styles.rowItem}>
            <TextField
              label={t('annoncer.time')}
              value={form.time}
              onChangeText={(v) => updateField('time', v)}
              placeholder="14:30"
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <TextField
              label={t('annoncer.seatsAvailable')}
              value={form.seatsTotal}
              onChangeText={(v) => updateField('seatsTotal', v)}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.rowItem}>
            <TextField
              label={t('annoncer.pricePerSeat')}
              value={form.pricePerSeat}
              onChangeText={(v) => updateField('pricePerSeat', v)}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.comfortGroup}>
          <Text style={styles.label}>{t('annoncer.comfortLabel')}</Text>
          <View style={styles.row}>
            {COMFORT_OPTIONS.map((option) => (
              <Button
                key={option.value}
                label={t(option.labelKey)}
                size="sm"
                variant={form.comfort === option.value ? 'primary' : 'outline'}
                onPress={() => updateField('comfort', option.value)}
              />
            ))}
          </View>
        </View>

        <TextField
          label={t('annoncer.baggage')}
          value={form.baggageAllowance}
          onChangeText={(v) => updateField('baggageAllowance', v)}
        />

        <View style={styles.comfortGroup}>
          <Text style={styles.label}>{t('annoncer.paymentMethodsLabel')}</Text>
          <View style={styles.row}>
            {RIDE_PAYMENT_METHODS.map((method) => (
              <Button
                key={method}
                label={t(PAYMENT_METHOD_LABEL_KEYS[method])}
                size="sm"
                variant={form.paymentMethods.includes(method) ? 'primary' : 'outline'}
                onPress={() => togglePaymentMethod(method)}
              />
            ))}
          </View>
        </View>

        <View style={styles.comfortGroup}>
          <Text style={styles.label}>{t('annoncer.stopLabel')}</Text>
          <View style={styles.row}>
            <Button
              label={t('annoncer.stopNone')}
              size="sm"
              variant={!form.hasIntermediateStop ? 'primary' : 'outline'}
              onPress={() => updateField('hasIntermediateStop', false)}
            />
            <Button
              label={t('annoncer.stopWith')}
              size="sm"
              variant={form.hasIntermediateStop ? 'primary' : 'outline'}
              onPress={() => updateField('hasIntermediateStop', true)}
            />
          </View>
        </View>

        <View style={styles.comfortGroup}>
          <Text style={styles.label}>{t('annoncer.amenitiesLabel')}</Text>
          <View style={styles.amenitiesGrid}>
            {AMENITY_ORDER.map((amenity) => (
              <Button
                key={amenity}
                label={t(AMENITY_LABEL_KEYS[amenity])}
                size="sm"
                variant={form.amenities.includes(amenity) ? 'primary' : 'outline'}
                onPress={() => toggleAmenity(amenity)}
              />
            ))}
          </View>
        </View>
        <TextField
          label={t('annoncer.description')}
          value={form.description}
          onChangeText={(v) => updateField('description', v)}
          multiline
          numberOfLines={3}
        />

        {fieldError ? <Text style={styles.error}>{fieldError}</Text> : null}
        {mutation.isError ? <Text style={styles.error}>{(mutation.error as Error).message}</Text> : null}

        <Button
          label={mutation.isPending ? t('annoncer.submitting') : t('annoncer.submit')}
          onPress={handleSubmit}
          loading={mutation.isPending}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.lg, fontWeight: '800', color: colors.foreground, marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowItem: { flex: 1 },
  comfortGroup: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.foreground },
  amenitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  error: { fontSize: fontSize.sm, color: colors.destructive },
});
