import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { colors, spacing, fontSize } from '@/lib/theme';

/**
 * Sends the password-reset email — mobile counterpart of the web's
 * `ForgotPasswordForm`. The reset itself still happens on web (the mailed
 * link opens `EXPO_PUBLIC_WEB_URL/auth/reset-password`): there is no mobile
 * deep link wired up for it yet, so the driver finishes there and comes back
 * to sign in here with the new password.
 */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!email.trim()) {
      setError('Veuillez renseigner votre adresse e-mail.');
      return;
    }

    setLoading(true);
    const { error: resetError } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${env.EXPO_PUBLIC_WEB_URL}/auth/reset-password`,
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message ?? "Échec de l'envoi. Réessayez.");
      return;
    }
    setSent(true);
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Mot de passe oublié</Text>
        <Text style={styles.subtitle}>
          Indiquez votre e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe sur le site web.
        </Text>

        {sent ? (
          <Text style={styles.success}>
            Un e-mail vous a été envoyé si un compte correspond à cette adresse.
          </Text>
        ) : (
          <View style={styles.form}>
            <TextField
              label="Adresse e-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label={loading ? 'Envoi…' : 'Envoyer le lien'} onPress={handleSubmit} loading={loading} />
          </View>
        )}

        <Link href="/" style={styles.link}>
          Retour à la connexion
        </Link>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xxl },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  subtitle: { fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: 'center' },
  form: { gap: spacing.md },
  error: { fontSize: fontSize.sm, color: colors.destructive, textAlign: 'center' },
  success: { fontSize: fontSize.sm, color: colors.secondary, textAlign: 'center' },
  link: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700', textAlign: 'center' },
});
