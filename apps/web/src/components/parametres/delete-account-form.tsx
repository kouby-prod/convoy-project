'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import {
  cancelAccountDeletion,
  fetchAccountDeletion,
  scheduleAccountDeletion,
} from '@/lib/account-deletion';
import { isApiError } from '@/lib/api-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormAlert } from '@/components/ui/form-alert';
import { PasswordInput } from '@/components/ui/password-input';
import { LabelledField } from '@/components/ui/labelled-field';
import { CardSkeleton } from '@/components/ui/list-skeleton';
import { toast } from '@/components/ui/toast';

const DELETION_KEY = ['account-deletion'] as const;

/** Danger zone: 30-day hold, then a hard wipe. The user can sign back in to cancel. */
export function DeleteAccountForm() {
  const t = useTranslations('Parametres.deleteAccount');
  const translateA11y = useTranslations('A11y');
  const format = useFormatter();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const query = useQuery({
    queryKey: [...DELETION_KEY, userId],
    queryFn: fetchAccountDeletion,
    enabled: Boolean(userId),
  });
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const schedule = useMutation({
    mutationFn: () => scheduleAccountDeletion(password || undefined),
    onSuccess: async (data) => {
      queryClient.setQueryData([...DELETION_KEY, userId], data);
      const date = data.purgeAt
        ? format.dateTime(new Date(data.purgeAt), { dateStyle: 'long' })
        : '';
      toast(t('success', { date }));
      queryClient.removeQueries({ queryKey: DELETION_KEY });
      await authClient.signOut();
      router.push('/auth/signin');
      router.refresh();
    },
  });

  const cancel = useMutation({
    mutationFn: cancelAccountDeletion,
    onSuccess: (data) => {
      queryClient.setQueryData([...DELETION_KEY, userId], data);
      toast(t('cancelled'));
    },
  });

  if (!userId || query.isLoading || query.isPending) {
    return <CardSkeleton rows={4} label={t('loading')} />;
  }

  const status = query.data;
  const errorMessage = (() => {
    const err = schedule.error ?? cancel.error ?? query.error;
    if (!err) return null;
    if (isApiError(err, 400)) return t('error');
    if (isApiError(err, 409)) return t('alreadyScheduled');
    return t('error');
  })();

  if (status?.scheduled && status.purgeAt) {
    const date = format.dateTime(new Date(status.purgeAt), { dateStyle: 'long' });
    return (
      <Card className="ring-destructive/25 dark:ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">{t('pendingTitle')}</CardTitle>
          <CardDescription>{t('pendingDescription', { date })}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {cancel.error ? <FormAlert>{t('cancelError')}</FormAlert> : null}
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {cancel.isPending ? t('cancelling') : t('cancel')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="ring-destructive/25 dark:ring-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmed) return;
            schedule.mutate();
          }}
          className="grid max-w-md gap-3"
        >
          {(status?.passwordRequired ?? true) ? (
            <LabelledField label={t('password')} htmlFor="delete-account-password">
              <PasswordInput
                id="delete-account-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                showLabel={translateA11y('showPassword')}
                hideLabel={translateA11y('hidePassword')}
              />
            </LabelledField>
          ) : (
            <p className="text-sm text-muted-foreground">{t('googleOnlyHint')}</p>
          )}
          <Checkbox
            label={t('confirm')}
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          {errorMessage ? <FormAlert>{errorMessage}</FormAlert> : null}
          <Button
            type="submit"
            variant="destructive"
            className="w-fit"
            disabled={
              schedule.isPending ||
              !confirmed ||
              (Boolean(status?.passwordRequired ?? true) && password.length < 8)
            }
          >
            {schedule.isPending ? t('submitting') : t('submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
