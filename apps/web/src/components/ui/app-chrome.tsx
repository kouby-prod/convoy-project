'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { Navbar } from '@/components/ui/navbar';
import { Footer } from '@/components/ui/footer';
import { SkipLink } from '@/components/ui/skip-link';
import { Toaster } from '@/components/ui/toast';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';
import { DeletionBanner } from '@/components/parametres/deletion-banner';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAIN_ID = 'main';

/** Site chrome. Checkout drops marketing nav/footer so the pay clock owns the page. */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const checkout = pathname.startsWith('/paiement/');
  const messages = pathname === '/messages' || pathname.startsWith('/messages/');
  const admin = pathname === '/admin' || pathname.startsWith('/admin/');

  if (checkout) {
    return (
      <ChromeRoot>
        <CheckoutBar />
        <DeletionBanner />
        <main
          id={MAIN_ID}
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 outline-none sm:px-6 sm:py-6"
        >
          {children}
        </main>
      </ChromeRoot>
    );
  }

  if (messages || admin) {
    return (
      <ChromeRoot>
        <Navbar />
        <DeletionBanner />
        <main
          id={MAIN_ID}
          tabIndex={-1}
          className={cn(
            'mx-auto flex min-h-0 w-full flex-1 flex-col px-0 py-0 outline-none',
            admin ? 'max-w-[90rem] sm:px-4 sm:py-3' : 'max-w-7xl sm:px-6 sm:py-6',
          )}
        >
          {children}
        </main>
      </ChromeRoot>
    );
  }

  return (
    <ChromeRoot>
      <Navbar />
      <DeletionBanner />
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 outline-none sm:px-6 sm:py-8"
      >
        {children}
      </main>
      <Footer />
    </ChromeRoot>
  );
}

function ChromeRoot({ children }: { children: ReactNode }) {
  const t = useTranslations('A11y');

  return (
    <>
      <SkipLink />
      {children}
      <Toaster dismissLabel={t('dismiss')} />
    </>
  );
}

function CheckoutBar() {
  const t = useTranslations('Paiement');
  const tNav = useTranslations('Navbar');

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/mes-reservations"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit min-h-11 gap-1.5')}
        >
          <ArrowLeft className="size-4" strokeWidth={2.25} aria-hidden />
          <span className="max-sm:sr-only">{t('backToBookings')}</span>
        </Link>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <Link href="/" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
            <Image
              src="/images/logo.png"
              alt={tNav('brand')}
              width={28}
              height={28}
              className="size-7 rounded-full"
            />
          </Link>
        </div>
      </div>
    </header>
  );
}
