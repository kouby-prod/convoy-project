'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';
import { cn } from '@/lib/utils';

function FooterColumn({
  title,
  links,
  align = 'start',
}: {
  title: string;
  links: { label: string; href: string }[];
  align?: 'start' | 'end';
}) {
  return (
    <div className={cn('flex flex-col gap-3', align === 'end' && 'sm:items-end sm:text-right')}>
      <h2 className="font-display text-lg font-semibold tracking-tight text-white">{title}</h2>
      <ul className="flex flex-col gap-1">
        {links.map(({ label, href }) => (
          <li key={href}>
            <Link
              href={href}
              className="-mx-2 inline-block rounded-md px-2 py-1 text-sm text-white/80 outline-none transition-all duration-200 hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-white/40"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface FooterProps {
  className?: string;
}

export function Footer({ className }: FooterProps) {
  const translateFooter = useTranslations('Footer');

  const aboutLinks = [
    { label: translateFooter('terms'), href: '/terms' },
    { label: translateFooter('cgv'), href: '/cgv' },
    { label: translateFooter('contratConducteur'), href: '/contrat-conducteur' },
    { label: translateFooter('responsibility'), href: '/responsibility' },
    { label: translateFooter('privacy'), href: '/privacy' },
    { label: translateFooter('mentionsLegales'), href: '/mentions-legales' },
    { label: translateFooter('contact'), href: '/contact' },
  ];
  const infoLinks = [
    { label: translateFooter('becomeDriver'), href: '/become-driver' },
    { label: translateFooter('becomePassenger'), href: '/become-passenger' },
    { label: translateFooter('passengerTips'), href: '/passenger-tips' },
    { label: translateFooter('driverTips'), href: '/driver-tips' },
  ];

  return (
    <footer className={cn('mt-auto w-full bg-brand-green text-white ring-1 ring-black/10', className)}>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2">
          <FooterColumn title={translateFooter('aboutTitle')} links={aboutLinks} align="start" />
          <FooterColumn title={translateFooter('infoTitle')} links={infoLinks} align="end" />
        </div>

        <div className="my-8 h-px bg-white/20" />

        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between">
          <p className="text-sm text-white/80">{translateFooter('copyright', { year: 2026 })}</p>
          <LocaleSwitcher className="text-white" />
        </div>
      </div>
    </footer>
  );
}
