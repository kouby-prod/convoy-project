import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { authClient } from '@/lib/auth-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { colors, spacing, fontSize } from '@/lib/theme';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Veuillez renseigner votre e-mail et votre mot de passe.');
      return;
    }

    setLoading(true);
    // On success, `Stack.Protected` in app/_layout.tsx reactively swaps to
    // (tabs) via the same session store `signIn.email` updates — no manual
    // navigation here.
    const { error: signInError } = await authClient.signIn.email({ email: email.trim(), password });
    setLoading(false);

    if (signInError) {
      setError(signInError.message ?? 'Échec de la connexion. Vérifiez vos identifiants.');
    }
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Carpool</Text>
        <Text style={styles.subtitle}>Connectez-vous pour rechercher et réserver un trajet.</Text>

        <View style={styles.form}>
          <TextField
            label="Adresse e-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextField
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={loading ? 'Connexion…' : 'Se connecter'} onPress={handleSubmit} loading={loading} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Pas encore de compte ?</Text>
          <Link href="/sign-up" style={styles.link}>
            Créer un compte
          </Link>
        </View>
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
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  footerText: { fontSize: fontSize.sm, color: colors.mutedForeground },
  link: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
});
