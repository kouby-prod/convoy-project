import { setRequestLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { BecomePassengerChecklist } from '@/components/onboarding/become-passenger-checklist';

export default async function BecomePassengerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('BecomePassenger');

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader title={t('title')} subtitle={t('lastUpdated')} />
      <BecomePassengerChecklist />
    </section>
  );
}
