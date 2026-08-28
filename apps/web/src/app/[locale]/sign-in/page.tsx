import { redirect } from 'next/navigation';
import { safeNextPath } from '@/lib/auth-urls';

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  const safe = safeNextPath(next);
  const qs = safe ? `?next=${encodeURIComponent(safe)}` : '';
  const destination = locale === 'fr' ? `/auth/signin${qs}` : `/${locale}/auth/signin${qs}`;
  redirect(destination);
}
