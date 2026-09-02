import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { LegalSection } from '@/components/legal/legal-page';
import { renderLegalPdf } from '@/lib/legal-pdf';

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Privacy');

  const pdf = await renderLegalPdf({
    title: t('title'),
    disclaimer: t('disclaimer'),
    lastUpdated: t('lastUpdated'),
    sections: t.raw('sections') as LegalSection[],
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="vie-privee-${locale}.pdf"`,
    },
  });
}
