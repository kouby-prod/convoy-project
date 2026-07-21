import { redirect } from 'next/navigation';

export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const destination = locale === 'fr' ? '/auth/signin' : `/${locale}/auth/signin`;
  redirect(destination);
}
