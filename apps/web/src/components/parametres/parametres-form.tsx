'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/**
 * Account settings: profile (name) and password, the two mutations
 * BetterAuth's core client exposes without any extra plugin — `updateUser`
 * (name/image) and `changePassword`. Email and phone are shown read-only:
 * changing either needs a verification flow (`changeEmail`/OTP) that isn't
 * enabled on the server yet.
 */
export function ParametresForm() {
  const t = useTranslations('Parametres');
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const user = session?.user;

  useEffect(() => {
    if (!isSessionPending && !user) router.push('/sign-in');
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
      setCurrentPassword('');
      setNewPassword('');
    }
  }

  if (isSessionPending || !user) return <p className="text-muted-foreground">{t('loading')}</p>;

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
            {profileState.error ? <p className="text-sm text-destructive">{profileState.error}</p> : null}
            {profileState.success ? (
              <p className="text-sm text-green-700">{t('profile.success')}</p>
            ) : null}
            <Button type="submit" size="sm" className="w-fit" disabled={profileState.loading || !name.trim()}>
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
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="newPassword">{t('password.new')}</Label>
              <Input
                id="newPassword"
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </div>
            {passwordState.error ? <p className="text-sm text-destructive">{passwordState.error}</p> : null}
            {passwordState.success ? (
              <p className="text-sm text-green-700">{t('password.success')}</p>
            ) : null}
            <Button
              type="submit"
              size="sm"
              className="w-fit"
              disabled={passwordState.loading || !currentPassword || newPassword.length < 8}
            >
              {passwordState.loading ? t('password.saving') : t('password.save')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
