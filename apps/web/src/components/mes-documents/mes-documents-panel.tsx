'use client';

import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DocumentUploadForm } from './document-upload-form';
import { MesDocumentsList } from './mes-documents-list';

/**
 * `/mes-documents` behind a session.
 *
 * Every route this page uses is authenticated, so without a session the requests
 * could only ever 401 — prompting for sign-in is more honest than rendering a
 * form that is guaranteed to fail.
 */
export function MesDocumentsPanel() {
  const t = useTranslations('Documents');
  const { data: session, isPending } = authClient.useSession();

  // Render nothing until the session resolves, to avoid flashing the sign-in
  // prompt at someone who is in fact signed in.
  if (isPending) return null;

  if (!session?.user) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 pt-8 text-center">
          <ShieldCheck className="size-8 text-primary" strokeWidth={2} aria-hidden />
          <p className="text-sm text-muted-foreground">{t('authRequired')}</p>
          <Link href="/sign-in" className={buttonVariants({ variant: 'primary' })}>
            {t('authCta')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
      <DocumentUploadForm />
      <MesDocumentsList />
    </div>
  );
}
