import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { authClient } from '@/lib/auth-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/StateMessage';
import { colors, spacing, fontSize } from '@/lib/theme';

export default function CompteScreen() {
  const { data: session, isPending } = authClient.useSession();
  // `phoneNumberClient`'s `phoneNumber`/`phoneNumberVerified` fields don't
  // merge into the inferred session type (same upstream generic-inference
  // limitation as `getCookie` in api-client.ts) — narrow locally instead of
  // widening the whole session type.
  const user = session?.user as
    | (NonNullable<typeof session>['user'] & { phoneNumber?: string; phoneNumberVerified?: boolean })
    | undefined;

  const [name, setName] = useState('');
  const [profileState, setProfileState] = useState<{ loading: boolean; error: string | null; success: boolean }>({
    loading: false,
    error: null,
    success: false,
  });

  useEffect(() => {
    if (user) setName(user.name ?? '');
  }, [user]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordState, setPasswordState] = useState<{ loading: boolean; error: string | null; success: boolean }>({
    loading: false,
    error: null,
    success: false,
  });

  async function handleSaveProfile() {
    setProfileState({ loading: true, error: null, success: false });
    const { error } = await authClient.updateUser({ name: name.trim() });
    setProfileState({ loading: false, error: error ? (error.message ?? 'Échec de la mise à jour.') : null, success: !error });
  }

  async function handleChangePassword() {
    setPasswordState({ loading: true, error: null, success: false });
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false });
    setPasswordState({
      loading: false,
      error: error ? (error.message ?? 'Échec du changement de mot de passe.') : null,
      success: !error,
    });
    if (!error) {
      setCurrentPassword('');
      setNewPassword('');
    }
  }

  if (isPending || !user) {
    return (
      <ScreenContainer>
        <LoadingState label="Chargement…" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.cardTitle}>Profil</Text>
          <View>
            <Text style={styles.label}>E-mail</Text>
            <Text style={styles.value}>
              {user.email} {user.emailVerified ? '' : '(non vérifié)'}
            </Text>
          </View>
          {user.phoneNumber ? (
            <View>
              <Text style={styles.label}>Téléphone</Text>
              <Text style={styles.value}>{user.phoneNumber}</Text>
            </View>
          ) : null}
          <TextField label="Nom" value={name} onChangeText={setName} />
          {profileState.error ? <Text style={styles.error}>{profileState.error}</Text> : null}
          {profileState.success ? <Text style={styles.success}>Profil mis à jour.</Text> : null}
          <Button
            label={profileState.loading ? 'Enregistrement…' : 'Enregistrer'}
            size="sm"
            onPress={handleSaveProfile}
            disabled={profileState.loading || !name.trim()}
          />
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Mot de passe</Text>
          <TextField
            label="Mot de passe actuel"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
          />
          <TextField label="Nouveau mot de passe" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
          {passwordState.error ? <Text style={styles.error}>{passwordState.error}</Text> : null}
          {passwordState.success ? <Text style={styles.success}>Mot de passe modifié.</Text> : null}
          <Button
            label={passwordState.loading ? 'Enregistrement…' : 'Changer le mot de passe'}
            size="sm"
            onPress={handleChangePassword}
            disabled={passwordState.loading || !currentPassword || newPassword.length < 8}
          />
        </Card>

        <Button label="Aide & contact" variant="outline" onPress={() => router.push('/contact')} />
        <Button label="Se déconnecter" variant="outline" onPress={() => authClient.signOut()} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  label: { fontSize: fontSize.xs, color: colors.mutedForeground },
  value: { fontSize: fontSize.sm, color: colors.foreground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  success: { fontSize: fontSize.sm, color: colors.secondary },
});
