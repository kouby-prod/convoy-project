import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { authClient } from '@/lib/auth-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { CheckEmailNotice } from '@/components/auth/CheckEmailNotice';
import { colors, spacing, fontSize } from '@/lib/theme';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // The server requires email verification, so a successful sign-up does not
  // create a session — show a persistent notice instead of assuming one.
  const [createdNotice, setCreatedNotice] = useState(false);

  async function handleSubmit() {
    setError(null);
    setCreatedNotice(false);

    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    const { error: signUpError } = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message ?? "Échec de l'inscription. Réessayez.");
      return;
    }

    setCreatedNotice(true);
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Créer un compte</Text>

        {createdNotice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Compte créé.</Text>
            <CheckEmailNotice email={email.trim()} />
            <Link href="/" style={styles.link}>
              Se connecter
            </Link>
          </View>
        ) : (
          <View style={styles.form}>
            <TextField label="Nom complet" value={name} onChangeText={setName} autoComplete="name" />
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
              autoComplete="new-password"
            />
            <TextField
              label="Confirmer le mot de passe"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label={loading ? 'Création…' : "S'inscrire"} onPress={handleSubmit} loading={loading} />
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Déjà inscrit ?</Text>
          <Link href="/" style={styles.link}>
            Se connecter
          </Link>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xxl },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  form: { gap: spacing.md },
  error: { fontSize: fontSize.sm, color: colors.destructive, textAlign: 'center' },
  notice: { gap: spacing.md, alignItems: 'center' },
  noticeText: { fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  footerText: { fontSize: fontSize.sm, color: colors.mutedForeground },
  link: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
});
