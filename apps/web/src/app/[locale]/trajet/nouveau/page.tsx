import { setRequestLocale } from 'next-intl/server';
import { TrajetCreateForm } from '@/components/trajet/trajet-create-form';

export default async function NewTrajetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <section className="mx-auto w-full max-w-5xl">
      <TrajetCreateForm />
    </section>
  );
}
