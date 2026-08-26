import { setRequestLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { BecomeDriverChecklist } from '@/components/onboarding/become-driver-checklist';

export default async function BecomeDriverPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('BecomeDriver');

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('lastUpdated')} />
      <BecomeDriverChecklist />
    </section>
  );
}
