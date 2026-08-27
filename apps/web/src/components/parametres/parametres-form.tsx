'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { signInHref } from '@/lib/auth-urls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormAlert, FormStatus } from '@/components/ui/form-alert';
import { CardSkeleton } from '@/components/ui/list-skeleton';
import { PasswordInput } from '@/components/ui/password-input';
import { LabelledField } from '@/components/ui/labelled-field';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';
import { AppearanceForm } from '@/components/parametres/appearance-form';
import { LanguageForm } from '@/components/parametres/language-form';
import { NotificationPrefsForm } from '@/components/parametres/notification-prefs-form';
import { ProfilePhotoForm } from '@/components/parametres/profile-photo-form';
import { SavedCardsForm } from '@/components/parametres/saved-cards-form';
import { DeleteAccountForm } from '@/components/parametres/delete-account-form';
import { SettingsSection } from '@/components/parametres/settings-section';
import { SettingsNav } from '@/components/parametres/settings-nav';

const SECTIONS = [
  { id: 'settings-account', key: 'account' },
  { id: 'settings-preferences', key: 'preferences' },
  { id: 'settings-payments', key: 'payments' },
  { id: 'settings-danger', key: 'danger' },
] as const;

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
  const showPayments = Boolean(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const sectionTitles = {
    account: t('sections.account'),
    preferences: t('sections.preferences'),
    payments: t('sections.payments'),
    danger: t('sections.danger'),
  } as const;
  const navItems = SECTIONS.filter((section) => section.id !== 'settings-payments' || showPayments).map(
    (section) => ({ id: section.id, title: sectionTitles[section.key] }),
  );

  useEffect(() => {
    if (!isSessionPending && !user) router.push(signInHref('/parametres'));
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
      revokeOtherSessions: true,
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

  const layoutClass =
    'flex min-w-0 flex-col gap-6 overflow-x-clip lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-x-8 lg:gap-y-8 lg:overflow-visible';

  if (isSessionPending || !user) {
    return (
      <div className={layoutClass}>
        <PageHeader className="mb-0 lg:col-span-2" title={t('title')} subtitle={t('subtitle')} />
        <div className="grid gap-6 lg:col-start-2">
          <CardSkeleton rows={5} label={t('loading')} />
          <CardSkeleton rows={4} label={t('loading')} />
        </div>
      </div>
    );
  }

  return (
    <div className={layoutClass}>
      <PageHeader className="mb-0 lg:col-span-2" title={t('title')} subtitle={t('subtitle')} />
      <SettingsNav items={navItems} label={t('navLabel')} className="lg:col-start-1 lg:row-start-2" />

      <div className="grid gap-10 lg:col-start-2 lg:row-start-2">
        <SettingsSection id="settings-account" title={t('sections.account')}>
          <Card>
            <CardHeader>
              <CardTitle>{t('profile.title')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
              <ProfilePhotoForm userId={user.id} image={user.image} />
              <div className="grid min-w-0 gap-4">
                <div className="grid gap-1.5">
                  <p className="text-sm font-medium leading-none text-foreground">{t('profile.email')}</p>
                  <p className="text-sm text-muted-foreground">
                    {user.email} {user.emailVerified ? '' : `(${t('profile.unverified')})`}
                  </p>
                </div>

                {user.phoneNumber ? (
                  <div className="grid gap-1.5">
                    <p className="text-sm font-medium leading-none text-foreground">{t('profile.phone')}</p>
                    <p className="text-sm text-muted-foreground">
                      {user.phoneNumber} {user.phoneNumberVerified ? '' : `(${t('profile.unverified')})`}
                    </p>
                  </div>
                ) : null}

                <form onSubmit={handleProfileSubmit} className="grid gap-3">
                  <LabelledField label={t('profile.name')} htmlFor="name">
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                  </LabelledField>
                  {profileState.error ? <FormAlert>{profileState.error}</FormAlert> : null}
                  {profileState.success ? <FormStatus>{t('profile.success')}</FormStatus> : null}
                  <Button type="submit" className="w-full sm:w-fit" disabled={profileState.loading || !name.trim()}>
                    {profileState.loading ? t('profile.saving') : t('profile.save')}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('password.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="grid max-w-md gap-3">
                <p className="text-sm text-muted-foreground">{t('password.hint')}</p>
                <LabelledField label={t('password.current')} htmlFor="currentPassword">
                  <PasswordInput
                    id="currentPassword"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    showLabel={translateA11y('showPassword')}
                    hideLabel={translateA11y('hidePassword')}
                  />
                </LabelledField>
                <LabelledField label={t('password.new')} htmlFor="newPassword">
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
                </LabelledField>
                {passwordState.error ? <FormAlert>{passwordState.error}</FormAlert> : null}
                {passwordState.success ? <FormStatus>{t('password.success')}</FormStatus> : null}
                <Button
                  type="submit"
                  className="w-full sm:w-fit"
                  disabled={passwordState.loading || !currentPassword || newPassword.length < 8}
                >
                  {passwordState.loading ? t('password.saving') : t('password.save')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </SettingsSection>

        <SettingsSection id="settings-preferences" title={t('sections.preferences')}>
          <div className="grid gap-4 sm:grid-cols-2 sm:items-stretch">
            <LanguageForm />
            <AppearanceForm />
          </div>
          <NotificationPrefsForm />
        </SettingsSection>

        {showPayments ? (
          <SettingsSection id="settings-payments" title={t('sections.payments')}>
            <SavedCardsForm />
          </SettingsSection>
        ) : null}

        <SettingsSection id="settings-danger" title={t('sections.danger')}>
          <DeleteAccountForm />
        </SettingsSection>
      </div>
    </div>
  );
}
