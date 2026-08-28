import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { authClient } from '@/lib/auth-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/StateMessage';
import { AvatarCard } from '@/components/account/AvatarCard';
import { NotificationPrefsCard } from '@/components/account/NotificationPrefsCard';
import { SavedCardsCard } from '@/components/account/SavedCardsCard';
import { DeleteAccountCard } from '@/components/account/DeleteAccountCard';
import { LanguageSwitcher } from '@/components/account/LanguageSwitcher';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

export default function CompteScreen() {
  const { t } = useI18n();
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
    setProfileState({ loading: false, error: error ? (error.message ?? t('compte.profileUpdateFailed')) : null, success: !error });
  }

  async function handleChangePassword() {
    setPasswordState({ loading: true, error: null, success: false });
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false });
    setPasswordState({
      loading: false,
      error: error ? (error.message ?? t('compte.passwordChangeFailed')) : null,
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
        <LoadingState label={t('common.loading')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <AvatarCard userId={user.id} />

        <Card>
          <Text style={styles.cardTitle}>{t('compte.profileTitle')}</Text>
          <View>
            <Text style={styles.label}>{t('compte.email')}</Text>
            <Text style={styles.value}>
              {user.email} {user.emailVerified ? '' : t('compte.notVerified')}
            </Text>
          </View>
          {user.phoneNumber ? (
            <View>
              <Text style={styles.label}>{t('compte.phone')}</Text>
              <Text style={styles.value}>{user.phoneNumber}</Text>
            </View>
          ) : null}
          <TextField label={t('compte.nameLabel')} value={name} onChangeText={setName} />
          {profileState.error ? <Text style={styles.error}>{profileState.error}</Text> : null}
          {profileState.success ? <Text style={styles.success}>{t('compte.profileUpdated')}</Text> : null}
          <Button
            label={profileState.loading ? t('compte.saving') : t('compte.save')}
            size="sm"
            onPress={handleSaveProfile}
            disabled={profileState.loading || !name.trim()}
          />
        </Card>

        <Card>
          <Text style={styles.cardTitle}>{t('compte.passwordTitle')}</Text>
          <TextField
            label={t('compte.currentPassword')}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
          />
          <TextField
            label={t('compte.newPassword')}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />
          {passwordState.error ? <Text style={styles.error}>{passwordState.error}</Text> : null}
          {passwordState.success ? <Text style={styles.success}>{t('compte.passwordChanged')}</Text> : null}
          <Button
            label={passwordState.loading ? t('compte.changingPassword') : t('compte.changePassword')}
            size="sm"
            onPress={handleChangePassword}
            disabled={passwordState.loading || !currentPassword || newPassword.length < 8}
          />
        </Card>

        <LanguageSwitcher />

        <NotificationPrefsCard />

        <SavedCardsCard />

        <Button label={t('compte.myVehicle')} variant="outline" onPress={() => router.push('/vehicle')} />
        <Button label={t('compte.helpInfo')} variant="outline" onPress={() => router.push('/legal')} />
        <Button label={t('compte.contactHelp')} variant="outline" onPress={() => router.push('/contact')} />
        <Button label={t('compte.signOut')} variant="outline" onPress={() => authClient.signOut()} />

        <DeleteAccountCard />
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
