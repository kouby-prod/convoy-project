import { setRequestLocale } from 'next-intl/server';
import { ParametresForm } from '@/components/parametres/parametres-form';

export default async function ParametresPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <section className="mx-auto w-full max-w-5xl">
      <ParametresForm />
    </section>
  );
}
