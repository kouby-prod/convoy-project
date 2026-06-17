import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { Providers } from './providers';
import { Navbar } from '@/components/ui/navbar';
import { Footer } from '@/components/ui/footer';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Carpool — web',
  description: 'Base skeleton: /ping proof',
};

// Pre-render both locales at build time.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Enable static rendering for this locale.
  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        {/* NextIntlClientProvider hands the active locale + messages to Client Components. */}
        <NextIntlClientProvider>
          <Providers>
            {/* Shared chrome — renders once, wraps every route. */}
            <Navbar theme="vibrant" cartCount={3} />
            <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
            <Footer theme="vibrant" />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
