import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/Button';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

/**
 * Shared "check your inbox" body — mobile counterpart of the web's
 * `CheckEmailPanel`, used after sign-up and after a sign-in blocked by
 * `requireEmailVerification`. The link in the email always opens on web
 * (mobile has no deep-linked "/auth/verified" screen, same call as the
 * forgot-password flow) — this only needs to offer a resend.
 */
export function CheckEmailNotice({ email }: { email: string }) {
  const { t } = useI18n();
  const [resendState, setResendState] = useState<'idle' | 'pending' | 'sent' | 'error'>('idle');

  async function handleResend() {
    setResendState('pending');
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: `${env.EXPO_PUBLIC_WEB_URL}/auth/verified`,
    });
    setResendState(error ? 'error' : 'sent');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.body}>{t('auth.checkEmail.body', { email })}</Text>
      {resendState === 'sent' ? <Text style={styles.success}>{t('auth.checkEmail.resent')}</Text> : null}
      {resendState === 'error' ? <Text style={styles.error}>{t('auth.checkEmail.resendFailed')}</Text> : null}
      <Button
        label={resendState === 'pending' ? t('auth.checkEmail.resending') : t('auth.checkEmail.resend')}
        variant="outline"
        disabled={resendState === 'pending'}
        onPress={() => void handleResend()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, alignItems: 'center' },
  body: { fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: 'center' },
  success: { fontSize: fontSize.sm, color: colors.secondary, textAlign: 'center' },
  error: { fontSize: fontSize.sm, color: colors.destructive, textAlign: 'center' },
});
