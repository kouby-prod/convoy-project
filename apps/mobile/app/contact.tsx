import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { api } from '@/lib/api-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { colors, spacing, fontSize } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

/**
 * Public support/contact form — `POST /contact`, mobile counterpart of the
 * web's `ContactForm`. Prefills name/email from the session when signed in,
 * same as web, though every screen under `(tabs)` is already auth-gated here.
 */
export default function ContactScreen() {
  const { t } = useI18n();
  const { data: session } = authClient.useSession();

  const [name, setName] = useState(session?.user?.name ?? '');
  const [email, setEmail] = useState(session?.user?.email ?? '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.contact.$post({ json: { name, email, subject, message } });
      if (!res.ok) throw new Error(t('contact.sendFailed'));
      return res.json();
    },
    onSuccess: () => {
      setSubject('');
      setMessage('');
    },
  });

  const canSubmit = name.trim() && email.trim() && subject.trim() && message.trim() && !mutation.isPending;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.title}>{t('contact.title')}</Text>
          <Text style={styles.subtitle}>{t('contact.subtitle')}</Text>
          <TextField label={t('contact.name')} value={name} onChangeText={setName} />
          <TextField
            label={t('contact.email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextField label={t('contact.subject')} value={subject} onChangeText={setSubject} />
          <TextField label={t('contact.message')} value={message} onChangeText={setMessage} multiline numberOfLines={5} />
          {mutation.isError ? <Text style={styles.error}>{(mutation.error as Error).message}</Text> : null}
          {mutation.isSuccess ? <Text style={styles.success}>{t('contact.sent')}</Text> : null}
          <Button
            label={mutation.isPending ? t('contact.sending') : t('contact.send')}
            onPress={() => mutation.mutate()}
            disabled={!canSubmit}
          />
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  subtitle: { fontSize: fontSize.sm, color: colors.mutedForeground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  success: { fontSize: fontSize.sm, color: colors.secondary },
});
