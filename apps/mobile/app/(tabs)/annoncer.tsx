import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { colors, spacing, fontSize } from '@/lib/theme';

type Comfort = 'standard' | 'confort' | 'premium';

const COMFORT_OPTIONS: { value: Comfort; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'confort', label: 'Confort' },
  { value: 'premium', label: 'Premium' },
];

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
};

/**
 * Driver-side "publish a trajet" form (`POST /trajets`) — the mobile
 * counterpart to `apps/web/src/components/annoncer/annoncer-list.tsx`. No
 * native date/time picker this pass (to avoid a new dependency): departure
 * date and time are two plain text fields, combined into an ISO string,
 * mirroring the free-text date filter already used on the search screen.
 */
export default function AnnoncerScreen() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
        },
      });
      if (!res.ok) throw new Error('Échec de la publication.');
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
      setFieldError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (form.departureCity.trim().toLowerCase() === form.destinationCity.trim().toLowerCase()) {
      setFieldError('Les villes de départ et d’arrivée doivent être différentes.');
      return;
    }
    const departureDate = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(departureDate.getTime()) || departureDate <= new Date()) {
      setFieldError('La date et l’heure de départ doivent être dans le futur.');
      return;
    }
    if (!Number.isFinite(Number(form.seatsTotal)) || Number(form.seatsTotal) < 1) {
      setFieldError('Le nombre de places doit être au moins 1.');
      return;
    }
    if (!Number.isFinite(Number(form.pricePerSeat)) || Number(form.pricePerSeat) < 0) {
      setFieldError('Le prix par place doit être positif.');
      return;
    }

    mutation.mutate();
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Publier un trajet</Text>

        <TextField
          label="Ville de départ"
          value={form.departureCity}
          onChangeText={(v) => updateField('departureCity', v)}
        />
        <TextField
          label="Ville d'arrivée"
          value={form.destinationCity}
          onChangeText={(v) => updateField('destinationCity', v)}
        />
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <TextField
              label="Date (AAAA-MM-JJ)"
              value={form.date}
              onChangeText={(v) => updateField('date', v)}
              placeholder="2026-08-15"
            />
          </View>
          <View style={styles.rowItem}>
            <TextField
              label="Heure (HH:MM)"
              value={form.time}
              onChangeText={(v) => updateField('time', v)}
              placeholder="14:30"
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <TextField
              label="Places disponibles"
              value={form.seatsTotal}
              onChangeText={(v) => updateField('seatsTotal', v)}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.rowItem}>
            <TextField
              label="Prix par place (CAD)"
              value={form.pricePerSeat}
              onChangeText={(v) => updateField('pricePerSeat', v)}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.comfortGroup}>
          <Text style={styles.label}>Confort</Text>
          <View style={styles.row}>
            {COMFORT_OPTIONS.map((option) => (
              <Button
                key={option.value}
                label={option.label}
                size="sm"
                variant={form.comfort === option.value ? 'primary' : 'outline'}
                onPress={() => updateField('comfort', option.value)}
              />
            ))}
          </View>
        </View>

        <TextField
          label="Bagages autorisés (optionnel)"
          value={form.baggageAllowance}
          onChangeText={(v) => updateField('baggageAllowance', v)}
        />
        <TextField
          label="Description (optionnel)"
          value={form.description}
          onChangeText={(v) => updateField('description', v)}
          multiline
          numberOfLines={3}
        />

        {fieldError ? <Text style={styles.error}>{fieldError}</Text> : null}
        {mutation.isError ? <Text style={styles.error}>{(mutation.error as Error).message}</Text> : null}

        <Button
          label={mutation.isPending ? 'Publication…' : 'Publier le trajet'}
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
  error: { fontSize: fontSize.sm, color: colors.destructive },
});
