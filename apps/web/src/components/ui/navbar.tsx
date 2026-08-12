'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  UserRound,
  Menu,
  X,
  LogOut,
  MessageSquare,
  ChevronDown,
  Route,
  FileText,
  Shield,
  Headphones,
  Bell,
} from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { authClient, isAdminRole } from '@/lib/auth-client';
import { createApiClient } from '@carpool/api-client';
import { env } from '@/lib/env';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Sectioned navbar (reduces clutter):
 * 1. Brand + Trajets (always visible browse entry)
 * 2. Search (discovery)
 * 3. Actions (Annoncer / Contact)
 * 4. Account (avatar menu — rides, bookings, messages, docs, admin, sign-out)
 */
export interface NavbarProps {
  className?: string;
}

export function Navbar({ className }: NavbarProps) {
  const translateNavbar = useTranslations('Navbar');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const accountMenuId = useId();
  const accountRef = useRef<HTMLDivElement>(null);
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const user = session?.user;
  const api = createApiClient(env.NEXT_PUBLIC_API_URL);
  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    enabled: !!user,
    queryFn: async () => {
      const res = await api.notifications.$get({ query: { page: 1, limit: 1 } });
      if (!res.ok) throw new Error('Failed to load notification count');
      return (await res.json()).unreadCount as number;
    },
    staleTime: 1000 * 60,
  });
  const unreadCount = unreadCountData ?? 0;
  const isAdmin = isAdminRole(user?.role);
  // List page only — not /trajet/nouveau or /trajet/:id.
  const isTrajetsActive = pathname === '/trajet';

  useEffect(() => {
    if (!isAccountOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setIsAccountOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsAccountOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isAccountOpen]);

  async function handleSignOut() {
    setIsAccountOpen(false);
    await authClient.signOut();
    router.push('/');
    router.refresh();
  }

  function handleQuickSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = quickSearch.trim();
    const params = new URLSearchParams();
    if (query) params.set('from', query);
    const queryString = params.toString();
    router.push(`/trajet${queryString ? `?${queryString}` : ''}`);
    setIsMobileMenuOpen(false);
  }

  const accountLinks = [
    { href: '/parametres', label: translateNavbar('account'), Icon: UserRound },
    ...(user
      ? [
          { href: '/notifications', label: translateNavbar('notifications'), Icon: Bell },
          { href: '/mes-trajets', label: translateNavbar('myTrajets'), Icon: Route },
          { href: '/mes-reservations', label: translateNavbar('myBookings'), Icon: FileText },
          { href: '/messages', label: translateNavbar('messages'), Icon: MessageSquare },
          { href: '/mes-documents', label: translateNavbar('documents'), Icon: FileText },
        ]
      : []),
    ...(isAdmin ? [{ href: '/admin', label: translateNavbar('admin'), Icon: Shield }] : []),
  ];

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full bg-brand-green text-white shadow-md ring-1 ring-black/10',
        className,
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:gap-6">
        {/* ── 1. Brand ─────────────────────────────────────────────── */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-md px-1 py-1 outline-none transition-all duration-200 hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-white/40"
        >
          <Image
            src="/images/logo.png"
            alt={translateNavbar('brand')}
            width={36}
            height={36}
            className="size-9 rounded-full shadow-sm ring-1 ring-white/30"
            priority
          />
          <span className="hidden font-display text-lg font-semibold tracking-tight sm:inline">
            {translateNavbar('brand')}
          </span>
        </Link>

        {/* Browse all rides — always in view (desktop + mobile chrome). */}
        <Link
          href="/trajet"
          title={translateNavbar('trajetsHint')}
          aria-current={isTrajetsActive ? 'page' : undefined}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-3 focus-visible:ring-white/40',
            isTrajetsActive
              ? 'bg-card/90 text-[#14532d] shadow-sm ring-1 ring-black/15'
              : 'bg-black/10 text-white/90 ring-1 ring-white/20 hover:bg-black/15 hover:text-white',
          )}
        >
          <Route className="size-4" strokeWidth={2.25} />
          <span>{translateNavbar('trajets')}</span>
        </Link>

        {/* ── 2. Search ────────────────────────────────────────────── */}
        <form
          onSubmit={handleQuickSearch}
          className="hidden min-w-0 flex-1 items-center justify-center gap-2 md:flex"
          aria-label={translateNavbar('sections.search')}
        >
          <label className="flex h-10 w-full max-w-md items-center gap-2 rounded-md bg-card px-3.5 text-foreground shadow-sm ring-1 ring-black/10 transition-all duration-200 focus-within:ring-3 focus-within:ring-ring/40 xl:max-w-lg">
            <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
            <input
              type="search"
              value={quickSearch}
              onChange={(event) => setQuickSearch(event.target.value)}
              placeholder={translateNavbar('searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <Button type="submit" size="default" className="shrink-0 px-4 font-semibold">
            {translateNavbar('search')}
          </Button>
        </form>

        {/* ── 3. Actions ───────────────────────────────────────────── */}
        <nav
          className="ml-auto hidden shrink-0 items-center gap-2 lg:flex"
          aria-label={translateNavbar('sections.actions')}
        >
          <Link
            href="/trajet/nouveau"
            className={cn(buttonVariants({ variant: 'primary', size: 'default' }), 'font-semibold')}
          >
            {translateNavbar('post')}
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-white/90 outline-none transition-all duration-200 hover:bg-white/15 hover:text-white focus-visible:ring-3 focus-visible:ring-white/40"
          >
            <Headphones className="size-4" strokeWidth={2.25} />
            {translateNavbar('contact')}
          </Link>
          {user ? (
            <Link
              href="/notifications"
              title={translateNavbar('notifications')}
              className="relative inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-white/90 outline-none transition-all duration-200 hover:bg-white/15 hover:text-white focus-visible:ring-3 focus-visible:ring-white/40"
            >
              <Bell className="size-4" strokeWidth={2.25} />
              {unreadCount > 0 ? (
                <Badge
                  variant="destructive"
                  className="absolute -right-2 -top-2 rounded-full px-1.5 text-[10px] font-semibold"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              ) : null}
            </Link>
          ) : null}
        </nav>

        <div className="hidden h-8 w-px shrink-0 bg-white/25 lg:block" aria-hidden />

        {/* ── 4. Account ───────────────────────────────────────────── */}
        <div
          ref={accountRef}
          className="relative flex shrink-0 items-center gap-1.5"
          aria-label={translateNavbar('sections.account')}
        >
          <button
            type="button"
            aria-label={translateNavbar('account')}
            aria-expanded={isAccountOpen}
            aria-controls={accountMenuId}
            onClick={() => setIsAccountOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-md bg-white/10 py-1 pl-1 pr-2 text-white outline-none transition-all duration-200 hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/40"
          >
            <span className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-card text-brand-blue shadow-sm ring-1 ring-black/10">
              <UserRound className="size-5" strokeWidth={2.25} />
            </span>
            <ChevronDown
              className={cn('size-4 transition-transform duration-200', isAccountOpen && 'rotate-180')}
              strokeWidth={2.25}
            />
          </button>

          {isAccountOpen ? (
            <div
              id={accountMenuId}
              role="menu"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-56 rounded-md bg-card p-1.5 text-card-foreground shadow-lg ring-1 ring-foreground/10"
            >
              {user ? (
                <p className="truncate px-3 py-2 text-xs font-medium text-muted-foreground">
                  {user.name || user.email}
                </p>
              ) : null}

              {!user && !isSessionPending ? (
                <Link
                  href="/auth/signin"
                  role="menuitem"
                  onClick={() => setIsAccountOpen(false)}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium outline-none transition-all hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <UserRound className="size-4 text-brand-blue" strokeWidth={2.25} />
                  {translateNavbar('signIn')}
                </Link>
              ) : null}

              {accountLinks.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={() => setIsAccountOpen(false)}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium outline-none transition-all hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <Icon className="size-4 text-brand-green" strokeWidth={2.25} />
                  {label}
                </Link>
              ))}

              {user ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive outline-none transition-all hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <LogOut className="size-4" strokeWidth={2.25} />
                  {translateNavbar('signOut')}
                </button>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            aria-label={translateNavbar('menu')}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
            className="flex size-10 items-center justify-center rounded-md text-white outline-none transition-all duration-200 hover:bg-white/15 active:translate-y-px focus-visible:ring-3 focus-visible:ring-white/40 lg:hidden"
          >
            {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer — same sections, stacked */}
      <div
        className={cn(
          'overflow-hidden border-t border-white/15 transition-all duration-500 ease-smooth lg:hidden',
          isMobileMenuOpen ? 'max-h-[40rem] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6">
          <section className="flex flex-col gap-2" aria-label={translateNavbar('sections.search')}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
              {translateNavbar('sections.search')}
            </p>
            <form onSubmit={handleQuickSearch} className="flex gap-2">
              <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md bg-card px-4 text-foreground ring-1 ring-black/10">
                <Search className="size-4 text-muted-foreground" strokeWidth={2.25} />
                <input
                  type="search"
                  value={quickSearch}
                  onChange={(event) => setQuickSearch(event.target.value)}
                  placeholder={translateNavbar('searchPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
              <Button type="submit" className="font-semibold">
                {translateNavbar('search')}
              </Button>
            </form>
          </section>

          <section className="flex flex-col gap-1" aria-label={translateNavbar('sections.actions')}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
              {translateNavbar('sections.actions')}
            </p>
            <Link
              href="/trajet"
              onClick={() => setIsMobileMenuOpen(false)}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold outline-none transition-all',
                isTrajetsActive
                  ? 'bg-card/90 text-[#14532d] ring-1 ring-black/15'
                  : 'bg-black/10 text-white/90 ring-1 ring-white/20',
              )}
            >
              <Route className="size-4" strokeWidth={2.25} />
              {translateNavbar('trajets')}
            </Link>
            <Link
              href="/trajet/nouveau"
              onClick={() => setIsMobileMenuOpen(false)}
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'font-semibold')}
            >
              {translateNavbar('post')}
            </Link>
            <Link
              href="/contact"
              onClick={() => setIsMobileMenuOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm font-medium text-white outline-none hover:bg-white/15"
            >
              {translateNavbar('contact')}
            </Link>
          </section>

          <section className="flex flex-col gap-1" aria-label={translateNavbar('sections.account')}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
              {translateNavbar('sections.account')}
            </p>
            {!isSessionPending && !user ? (
              <Link
                href="/auth/signin"
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-semibold text-white outline-none hover:bg-white/15"
              >
                {translateNavbar('signIn')}
              </Link>
            ) : null}
            {accountLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-white outline-none hover:bg-white/15"
              >
                {label}
              </Link>
            ))}
            {user ? (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  void handleSignOut();
                }}
                className="rounded-md px-3 py-2.5 text-left text-sm font-medium text-white outline-none hover:bg-white/15"
              >
                {translateNavbar('signOut')}
              </button>
            ) : null}
          </section>
        </div>
      </div>
    </header>
  );
}
