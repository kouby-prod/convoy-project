'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Flag } from 'lucide-react';
import { createApiClient } from '@carpool/api-client';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

export function ReportThreadTrigger({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  const t = useTranslations('Messages');
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="shrink-0 text-muted-foreground"
      aria-expanded={open}
      aria-label={t('report.cta')}
      onClick={onClick}
    >
      <Flag className="size-3.5" strokeWidth={2.25} aria-hidden />
      <span className="hidden sm:inline">{t('report.cta')}</span>
    </Button>
  );
}

/** Forwards a thread report to support via POST /contact. */
export function ReportThreadPanel({
  bookingId,
  counterpartName,
  route,
  onClose,
}: {
  bookingId: string;
  counterpartName: string;
  route: string;
  onClose: () => void;
}) {
  const t = useTranslations('Messages');
  const { data: session } = authClient.useSession();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const name = session?.user?.name?.trim() || session?.user?.email || t('counterpartUnknown');
      const email = session?.user?.email;
      if (!email) throw new Error(t('report.needEmail'));
      const res = await api.contact.$post({
        json: {
          name,
          email,
          subject: t('report.subject', { name: counterpartName }),
          message: t('report.body', {
            bookingId,
            route,
            name: counterpartName,
            reason: reason.trim() || t('report.noReason'),
          }),
        },
      });
      if (!res.ok) throw new Error(t('report.error'));
      return res.json();
    },
  });

  return (
    <div className="grid gap-2 rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/5">
      <p className="text-sm text-foreground">{t('report.hint')}</p>
      {mutation.isSuccess ? (
        <p className="text-sm text-muted-foreground">{t('report.success')}</p>
      ) : (
        <>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('report.placeholder')}
            rows={3}
            maxLength={5000}
            disabled={mutation.isPending}
          />
          {mutation.isError ? <p className="text-sm text-destructive">{mutation.error.message}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="sm"
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
              className="sm:w-fit"
            >
              {mutation.isPending ? t('report.sending') : t('report.submit')}
            </Button>
            <Button size="sm" variant="outline" onClick={onClose} className="sm:w-fit">
              {t('report.cancel')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
