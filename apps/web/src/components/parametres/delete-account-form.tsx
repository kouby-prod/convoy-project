'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormAlert } from '@/components/ui/form-alert';
import { PasswordInput } from '@/components/ui/password-input';
import { LabelledField } from '@/components/ui/labelled-field';
import { toast } from '@/components/ui/toast';

function isRestrictedDelete(error: { message?: string | null; status?: string | number } | null): boolean {
  if (!error) return false;
  const status = String(error.status ?? '');
  if (status === '500' || status === 'INTERNAL_SERVER_ERROR') return true;
  const message = (error.message ?? '').toLowerCase();
  return message.includes('foreign key') || message.includes('restrict') || message.includes('violat');
}

/** Danger zone: password + explicit confirm. Ledger FKs are restrict — those accounts stay. */
export function DeleteAccountForm() {
  const t = useTranslations('Parametres.deleteAccount');
  const translateA11y = useTranslations('A11y');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    setLoading(true);
    setError(null);

    const { error: deleteError } = await authClient.deleteUser({ password });

    if (deleteError) {
      setLoading(false);
      setError(isRestrictedDelete(deleteError) ? t('restricted') : (deleteError.message ?? t('error')));
      return;
    }

    toast(t('success'));
    router.push('/');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <p className="text-sm text-muted-foreground">{t('description')}</p>
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
          <Checkbox
            label={t('confirm')}
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Button
            type="submit"
            variant="destructive"
            className="w-fit"
            disabled={loading || !confirmed || password.length < 8}
          >
            {loading ? t('submitting') : t('submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
