import { cva, type VariantProps } from 'class-variance-authority';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';
import { cn } from '@/lib/utils';

/* ───────────────────────────────────────────────────────────────────────────
   Footer — bookends the Navbar with the same three color combinations.

   - vibrant  : green/yellow brand (CAN-VOITURAGE charte graphique)
   - breezing : sky → cyan → teal
   - smooth   : indigo → slate

   Follows the design system: heavy radius, soft shadow + hairline ring,
   opacity-shift hovers, smooth easing, 3px focus ring. Copy comes from
   next-intl ('Footer' namespace). Hosts the FR|EN language switcher.
   ─────────────────────────────────────────────────────────────────────────── */

const footerVariants = cva('w-full ring-1 transition-all duration-500 ease-smooth', {
  variants: {
    theme: {
      vibrant: 'bg-gradient-to-b from-green-600 to-green-700 text-white ring-white/10',
      breezing: 'bg-gradient-to-b from-cyan-400 to-teal-500 text-white ring-white/20',
      smooth: 'bg-gradient-to-b from-indigo-500 to-slate-700 text-white ring-white/10',
    },
  },
  defaultVariants: { theme: 'vibrant' },
});

/** A footer column: heading + its links (translation key → route). */
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
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <ul className="flex flex-col gap-1">
        {links.map(({ label, href }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                '-mx-2 inline-block rounded-2xl px-2 py-1 text-sm text-white/80 outline-none transition-all duration-200',
                'hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-white/40',
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface FooterProps extends VariantProps<typeof footerVariants> {
  className?: string;
}

export function Footer({ theme = 'vibrant', className }: FooterProps) {
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
    <footer className={cn(footerVariants({ theme }), className)}>
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Link columns — spread to the edges like the reference. */}
        <div className="grid gap-10 sm:grid-cols-2">
          <FooterColumn title={translateFooter('aboutTitle')} links={aboutLinks} align="start" />
          <FooterColumn title={translateFooter('infoTitle')} links={infoLinks} align="end" />
        </div>

        {/* Divider */}
        <div className="my-8 h-px bg-white/15" />

        {/* Bottom bar: copyright + language switcher */}
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between">
          <p className="text-sm text-white/80">{translateFooter('copyright', { year: 2026 })}</p>
          <LocaleSwitcher className="text-white" />
        </div>
      </div>
    </footer>
  );
}
