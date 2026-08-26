import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { fetchAccountDeletion, scheduleAccountDeletion, cancelAccountDeletion } from '@/lib/account-deletion';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { colors, fontSize } from '@/lib/theme';

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(value));
}

/** Danger zone: 30-day hold, then a hard wipe. Signing back in during the hold cancels it. */
export function DeleteAccountCard() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['account-deletion'],
    queryFn: fetchAccountDeletion,
  });

  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const schedule = useMutation({
    mutationFn: () => scheduleAccountDeletion(password || undefined),
    onSuccess: async (data) => {
      queryClient.setQueryData(['account-deletion'], data);
      // No manual navigation: `Stack.Protected` in app/_layout.tsx reactively
      // swaps to (auth) via the same session store `signOut` updates.
      await authClient.signOut();
    },
  });

  const cancel = useMutation({
    mutationFn: cancelAccountDeletion,
    onSuccess: (data) => queryClient.setQueryData(['account-deletion'], data),
  });

  const status = query.data;

  if (query.isLoading) {
    return (
      <Card>
        <Text style={styles.value}>Chargement…</Text>
      </Card>
    );
  }

  if (status?.scheduled && status.purgeAt) {
    return (
      <Card style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>Suppression programmée</Text>
        <Text style={styles.value}>
          Votre compte sera définitivement supprimé le {formatDate(status.purgeAt)}. Reconnectez-vous pour annuler.
        </Text>
        {cancel.isError ? <Text style={styles.error}>L'annulation a échoué.</Text> : null}
        <Button
          label={cancel.isPending ? 'Annulation…' : 'Annuler la suppression'}
          variant="outline"
          size="sm"
          disabled={cancel.isPending}
          onPress={() => cancel.mutate()}
        />
      </Card>
    );
  }

  const passwordRequired = status?.passwordRequired ?? true;
  const canSubmit = confirmed && (!passwordRequired || password.length >= 8) && !schedule.isPending;

  return (
    <Card style={styles.dangerCard}>
      <Text style={styles.dangerTitle}>Supprimer mon compte</Text>
      <Text style={styles.value}>
        Votre compte sera désactivé immédiatement puis définitivement supprimé après 30 jours.
      </Text>
      {passwordRequired ? (
        <TextField label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry />
      ) : (
        <Text style={styles.value}>Compte lié à Google — aucun mot de passe requis.</Text>
      )}
      <View style={styles.row}>
        <Button
          label={confirmed ? '✓ Je confirme' : 'Je confirme la suppression'}
          size="sm"
          variant={confirmed ? 'primary' : 'outline'}
          onPress={() => setConfirmed((c) => !c)}
        />
      </View>
      {schedule.isError ? <Text style={styles.error}>La suppression a échoué.</Text> : null}
      <Button
        label={schedule.isPending ? 'Envoi…' : 'Supprimer mon compte'}
        variant="destructive"
        size="sm"
        disabled={!canSubmit}
        onPress={() => schedule.mutate()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  dangerCard: { borderColor: colors.destructive },
  dangerTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.destructive },
  value: { fontSize: fontSize.sm, color: colors.foreground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  row: { flexDirection: 'row' },
});
