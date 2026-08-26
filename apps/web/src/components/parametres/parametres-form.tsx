'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FormAlert, FormStatus } from '@/components/ui/form-alert';
import { CardSkeleton } from '@/components/ui/list-skeleton';
import { PasswordInput } from '@/components/ui/password-input';
import { toast } from '@/components/ui/toast';
import { AppearanceForm } from '@/components/parametres/appearance-form';
import { LanguageForm } from '@/components/parametres/language-form';
import { NotificationPrefsForm } from '@/components/parametres/notification-prefs-form';
import { DeleteAccountForm } from '@/components/parametres/delete-account-form';

/**
 * Account settings: profile (name) and password, the two mutations
 * BetterAuth's core client exposes without any extra plugin — `updateUser`
 * (name/image) and `changePassword`. Email and phone are shown read-only:
 * changing either needs a verification flow (`changeEmail`/OTP) that isn't
 * enabled on the server yet.
 */
export function ParametresForm() {
  const t = useTranslations('Parametres');
  const translateA11y = useTranslations('A11y');
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const user = session?.user;

  useEffect(() => {
    if (!isSessionPending && !user) router.push('/auth/signin');
  }, [isSessionPending, router, user]);

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

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileState({ loading: true, error: null, success: false });

    const { error } = await authClient.updateUser({ name: name.trim() });

    setProfileState({
      loading: false,
      error: error ? (error.message ?? t('profile.error')) : null,
      success: !error,
    });
    if (!error) toast(t('profile.success'));
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordState({ loading: true, error: null, success: false });

    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: false,
    });

    setPasswordState({
      loading: false,
      error: error ? (error.message ?? t('password.error')) : null,
      success: !error,
    });
    if (!error) {
      toast(t('password.success'));
      setCurrentPassword('');
      setNewPassword('');
    }
  }

  if (isSessionPending || !user) return <CardSkeleton rows={5} label={t('loading')} />;

  return (
    <div className="grid gap-6 md:max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t('profile.email')}</Label>
            <p className="text-sm text-muted-foreground">
              {user.email} {user.emailVerified ? '' : `(${t('profile.unverified')})`}
            </p>
          </div>

          {user.phoneNumber ? (
            <div className="grid gap-1.5">
              <Label>{t('profile.phone')}</Label>
              <p className="text-sm text-muted-foreground">
                {user.phoneNumber} {user.phoneNumberVerified ? '' : `(${t('profile.unverified')})`}
              </p>
            </div>
          ) : null}

          <form onSubmit={handleProfileSubmit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="name">{t('profile.name')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            {profileState.error ? <FormAlert>{profileState.error}</FormAlert> : null}
            {profileState.success ? <FormStatus>{t('profile.success')}</FormStatus> : null}
            <Button type="submit" className="w-fit" disabled={profileState.loading || !name.trim()}>
              {profileState.loading ? t('profile.saving') : t('profile.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('password.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="currentPassword">{t('password.current')}</Label>
              <PasswordInput
                id="currentPassword"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
                showLabel={translateA11y('showPassword')}
                hideLabel={translateA11y('hidePassword')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="newPassword">{t('password.new')}</Label>
              <PasswordInput
                id="newPassword"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                showLabel={translateA11y('showPassword')}
                hideLabel={translateA11y('hidePassword')}
              />
            </div>
            {passwordState.error ? <FormAlert>{passwordState.error}</FormAlert> : null}
            {passwordState.success ? <FormStatus>{t('password.success')}</FormStatus> : null}
            <Button
              type="submit"
              className="w-fit"
              disabled={passwordState.loading || !currentPassword || newPassword.length < 8}
            >
              {passwordState.loading ? t('password.saving') : t('password.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <LanguageForm />

      <AppearanceForm />

      <NotificationPrefsForm />

      <DeleteAccountForm />
    </div>
  );
}
