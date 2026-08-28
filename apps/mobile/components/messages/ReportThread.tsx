import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

/** Forwards a thread report to support via POST /contact — same as the web's `ReportThreadPanel`. */
export function ReportThread({
  bookingId,
  counterpartName,
  route,
  onClose,
}: {
  bookingId: string;
  counterpartName: string;
  route: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { data: session } = authClient.useSession();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const name = session?.user?.name?.trim() || session?.user?.email || 'Utilisateur inconnu';
      const email = session?.user?.email;
      if (!email) throw new Error(t('reportThread.missingEmail'));
      const res = await api.contact.$post({
        json: {
          name,
          email,
          subject: `Signalement — conversation avec ${counterpartName}`,
          message: `Réservation : ${bookingId}\nTrajet : ${route}\nAvec : ${counterpartName}\n\nMotif :\n${
            reason.trim() || 'Non précisé'
          }`,
        },
      });
      if (!res.ok) throw new Error(t('reportThread.genericError'));
      return res.json();
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>{t('reportThread.description')}</Text>
      {mutation.isSuccess ? (
        <Text style={styles.value}>{t('reportThread.sent')}</Text>
      ) : (
        <>
          <TextField
            label={t('reportThread.reasonLabel')}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
          />
          {mutation.isError ? <Text style={styles.error}>{(mutation.error as Error).message}</Text> : null}
          <View style={styles.row}>
            <Button
              label={mutation.isPending ? t('reportThread.sending') : t('reportThread.send')}
              variant="destructive"
              size="sm"
              disabled={mutation.isPending}
              onPress={() => mutation.mutate()}
            />
            <Button label={t('reportThread.cancel')} variant="outline" size="sm" onPress={onClose} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, padding: spacing.md, backgroundColor: colors.muted, borderRadius: radius.md },
  hint: { fontSize: fontSize.sm, color: colors.foreground },
  value: { fontSize: fontSize.sm, color: colors.mutedForeground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  row: { flexDirection: 'row', gap: spacing.sm },
});
