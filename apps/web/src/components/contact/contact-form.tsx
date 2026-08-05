'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/**
 * Public contact form (`POST /contact`) — no session required, but prefills
 * name/email from the session when one exists. The endpoint only forwards
 * an email to support; there is nothing to fetch, so this has no query,
 * just the one mutation.
 */
export function ContactForm() {
  const t = useTranslations('Contact');
  const { data: session } = authClient.useSession();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (session?.user) {
      setName((current) => current || session.user.name || '');
      setEmail((current) => current || session.user.email || '');
    }
  }, [session?.user]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.contact.$post({ json: { name, email, subject, message } });
      if (!res.ok) throw new Error(t('errors.generic'));
      return res.json();
    },
    onSuccess: () => {
      setSubject('');
      setMessage('');
    },
  });

  return (
    <Card className="md:max-w-lg">
      <CardContent className="p-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
          className="grid gap-4"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="contact-name">{t('form.name')}</Label>
            <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contact-email">{t('form.email')}</Label>
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contact-subject">{t('form.subject')}</Label>
            <Input
              id="contact-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contact-message">{t('form.message')}</Label>
            <Textarea
              id="contact-message"
              className="min-h-32"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          {mutation.isSuccess ? <p className="text-sm text-green-700">{t('success')}</p> : null}
          {mutation.isError ? <p className="text-sm text-destructive">{t('errors.generic')}</p> : null}

          <Button type="submit" className="w-fit" disabled={mutation.isPending}>
            {mutation.isPending ? t('form.submitting') : t('form.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
