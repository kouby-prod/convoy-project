import { redirect } from 'next/navigation';

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const destination = locale === 'fr' ? '/auth/signup' : `/${locale}/auth/signup`;
  redirect(destination);
}
