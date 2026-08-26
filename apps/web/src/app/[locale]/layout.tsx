import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono, Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { Providers } from './providers';
import { Navbar } from '@/components/ui/navbar';
import { Footer } from '@/components/ui/footer';
import { cn } from '@/lib/utils';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'Convoy — covoiturage',
  description: 'Réservez, proposez et partagez vos trajets en toute confiance.',
};

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

  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={cn(inter.variable, geistSans.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider>
          <Providers>
            <Navbar />
            <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
            <Footer />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
