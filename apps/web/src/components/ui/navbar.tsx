'use client';

import { useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { useTranslations } from 'next-intl';
import { Search, ShoppingCart, UserRound, Menu, X, LogOut } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient, isAdminRole } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

/* ───────────────────────────────────────────────────────────────────────────
   Navbar — three color combinations, one layout.

   - vibrant  : green/yellow brand (CAN-VOITURAGE charte graphique), glassy CTA
   - breezing : airy sky→cyan→teal, light and open
   - smooth   : muted indigo→slate, sophisticated and calm

   Follows the design system: heavy radius, soft shadow + hairline ring,
   opacity-shift hovers, smooth easing, 3px focus ring. Copy comes from
   next-intl ('Navbar' namespace) — French primary, English secondary.
   ─────────────────────────────────────────────────────────────────────────── */

const navbarVariants = cva(
  'sticky top-0 z-50 w-full ring-1 backdrop-blur-xl transition-all duration-500 ease-smooth',
  {
    variants: {
      theme: {
        vibrant: 'bg-gradient-to-r from-green-600 via-green-600 to-green-700 text-white ring-white/10 shadow-lg shadow-green-900/20',
        breezing:
          'bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400 text-white ring-white/20 shadow-lg shadow-cyan-900/10',
        smooth:
          'bg-gradient-to-r from-indigo-500 via-violet-500 to-slate-600 text-white ring-white/10 shadow-xl shadow-slate-900/20',
      },
    },
    defaultVariants: { theme: 'vibrant' },
  },
);

/** Per-theme accents that CVA's single-class map can't express cleanly. */
const themeAccents = {
  vibrant: {
    link: 'hover:bg-white/15 focus-visible:ring-white/40',
    icon: 'hover:bg-white/15 focus-visible:ring-white/40',
    search: 'focus-within:ring-white/50 focus-within:border-white/60',
    cta: 'bg-white text-green-700 hover:bg-white/90 focus-visible:ring-white/50',
    badge: 'bg-amber-400 text-green-900',
    logoMark: 'bg-white/15 text-white',
  },
  breezing: {
    link: 'hover:bg-white/25 focus-visible:ring-white/50',
    icon: 'hover:bg-white/25 focus-visible:ring-white/50',
    search: 'focus-within:ring-white/60 focus-within:border-white/70',
    cta: 'bg-white text-teal-600 hover:bg-white/90 focus-visible:ring-white/60',
    badge: 'bg-rose-400 text-white',
    logoMark: 'bg-white/25 text-white',
  },
  smooth: {
    link: 'hover:bg-white/12 focus-visible:ring-white/40',
    icon: 'hover:bg-white/12 focus-visible:ring-white/40',
    search: 'focus-within:ring-white/40 focus-within:border-white/50',
    cta: 'bg-white text-indigo-600 hover:bg-white/90 focus-visible:ring-white/50',
    badge: 'bg-fuchsia-400 text-white',
    logoMark: 'bg-white/12 text-white',
  },
} as const;

/** Nav links: a translation key + the route it points to. */
interface NavLink {
  translationKey: string;
  href: string;
}

/** Shown to everyone, signed in or not. */
const PUBLIC_NAV_LINKS: NavLink[] = [
  { translationKey: 'search', href: '/trajet' },
  { translationKey: 'post', href: '/trajet/nouveau' },
];

const CONTACT_NAV_LINK: NavLink = { translationKey: 'contact', href: '/contact' };

export interface NavbarProps extends VariantProps<typeof navbarVariants> {
  className?: string;
  /** Items in the cart — renders a badge when > 0. */
  cartCount?: number;
}

export function Navbar({ theme = 'vibrant', className, cartCount = 0 }: NavbarProps) {
  const translateNavbar = useTranslations('Navbar');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const palette = themeAccents[theme ?? 'vibrant'];

  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const user = session?.user;

  // "Mes documents" only means something once you have an account, and the
  // backoffice link is offered only to admins. Hiding the link is courtesy —
  // both routes are enforced server-side regardless of what is rendered here.
  const navLinks: NavLink[] = [
    ...PUBLIC_NAV_LINKS,
    ...(user ? [{ translationKey: 'documents', href: '/mes-documents' }] : []),
    ...(isAdminRole(user?.role) ? [{ translationKey: 'admin', href: '/admin' }] : []),
    CONTACT_NAV_LINK,
  ];

  async function handleSignOut() {
    await authClient.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <header className={cn(navbarVariants({ theme }), className)}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        {/* Brand */}
        <Link
          href="/"
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-3xl px-2 py-1.5 outline-none transition-all duration-200 focus-visible:ring-3',
            palette.icon,
          )}
        >
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-2xl text-sm font-bold tracking-tight',
              palette.logoMark,
            )}
          >
            C
          </span>
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">{translateNavbar('brand')}</span>
        </Link>

        {/* Search — grows to fill the rail */}
        <label
          className={cn(
            'group flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/30 bg-white/95 px-4 text-foreground shadow-sm ring-0 transition-all duration-200 focus-within:ring-3',
            palette.search,
          )}
        >
          <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.5} />
          <input
            type="search"
            placeholder={translateNavbar('searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map(({ translationKey, href }) => (
            <Link
              key={translationKey}
              href={href}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-3',
                palette.link,
              )}
            >
              {translateNavbar(translationKey)}
            </Link>
          ))}
          {user && (
            <>
              <Link
                href="/mes-trajets"
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-3',
                  palette.link,
                )}
              >
                {translateNavbar('myTrajets')}
              </Link>
              <Link
                href="/mes-reservations"
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-3',
                  palette.link,
                )}
              >
                {translateNavbar('myBookings')}
              </Link>
            </>
          )}
        </nav>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Cart */}
          <button
            type="button"
            aria-label={translateNavbar('cart')}
            className={cn(
              'relative flex size-10 items-center justify-center rounded-full outline-none transition-all duration-200 active:translate-y-px focus-visible:ring-3',
              palette.icon,
            )}
          >
            <ShoppingCart className="size-5" strokeWidth={2.25} />
            {cartCount > 0 && (
              <span
                className={cn(
                  'absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-5 ring-2 ring-white/20',
                  palette.badge,
                )}
              >
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>

          {/* Auth — sign-in CTA when logged out, name + sign-out when logged in.
              Nothing renders until the session resolves, to avoid a flash. */}
          {!isSessionPending && !user && (
            <Link
              href="/sign-in"
              className={cn(
                'hidden h-10 items-center rounded-full px-5 text-sm font-semibold shadow-sm outline-none transition-all duration-200 active:translate-y-px focus-visible:ring-3 sm:inline-flex',
                palette.cta,
              )}
            >
              {translateNavbar('signIn')}
            </Link>
          )}

          {user && (
            <>
              <span className="hidden max-w-48 truncate text-sm font-medium sm:inline">
                {user.name || user.email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                aria-label={translateNavbar('signOut')}
                className={cn(
                  'flex size-10 items-center justify-center rounded-full outline-none transition-all duration-200 active:translate-y-px focus-visible:ring-3',
                  palette.icon,
                )}
              >
                <LogOut className="size-5" strokeWidth={2.25} />
              </button>
            </>
          )}

          {/* Avatar — links to account settings (redirects to sign-in itself if logged out) */}
          <Link
            href="/parametres"
            aria-label={translateNavbar('account')}
            className={cn(
              'flex size-10 items-center justify-center overflow-hidden rounded-full bg-white/90 text-slate-600 ring-1 ring-white/40 outline-none transition-all duration-200 hover:bg-white active:translate-y-px focus-visible:ring-3',
              palette.icon,
            )}
          >
            <UserRound className="size-5" strokeWidth={2.25} />
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label={translateNavbar('menu')}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
            className={cn(
              'flex size-10 items-center justify-center rounded-full outline-none transition-all duration-200 active:translate-y-px focus-visible:ring-3 lg:hidden',
              palette.icon,
            )}
          >
            {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          'overflow-hidden border-t border-white/10 transition-all duration-500 ease-smooth lg:hidden',
          isMobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
          {navLinks.map(({ translationKey, href }) => (
            <Link
              key={translationKey}
              href={href}
              className={cn(
                'rounded-2xl px-4 py-2.5 text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-3',
                palette.link,
              )}
            >
              {translateNavbar(translationKey)}
            </Link>
          ))}
          {user && (
            <>
              <Link
                href="/mes-trajets"
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-3',
                  palette.link,
                )}
              >
                {translateNavbar('myTrajets')}
              </Link>
              <Link
                href="/mes-reservations"
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm font-medium outline-none transition-all duration-200 focus-visible:ring-3',
                  palette.link,
                )}
              >
                {translateNavbar('myBookings')}
              </Link>
            </>
          )}
          {!isSessionPending && !user && (
            <Link
              href="/sign-in"
              className={cn(
                'mt-1 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold shadow-sm outline-none transition-all duration-200 focus-visible:ring-3',
                palette.cta,
              )}
            >
              {translateNavbar('signIn')}
            </Link>
          )}

          {user && (
            <button
              type="button"
              onClick={handleSignOut}
              className={cn(
                'mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold shadow-sm outline-none transition-all duration-200 focus-visible:ring-3',
                palette.cta,
              )}
            >
              <LogOut className="size-4" strokeWidth={2.25} />
              {translateNavbar('signOut')}
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
