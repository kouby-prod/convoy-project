'use client';

import { AlertTriangle, CreditCard, SlidersHorizontal, UserRound, type LucideIcon } from 'lucide-react';
import { SectionNav, type SectionNavItem } from '@/components/ui/section-nav';

const ICONS: Record<string, LucideIcon> = {
  'settings-account': UserRound,
  'settings-preferences': SlidersHorizontal,
  'settings-payments': CreditCard,
  'settings-danger': AlertTriangle,
};

export type SettingsNavItem = { id: string; title: string };

/** Settings rail — same pill/scroll as other long pages, with section icons. */
export function SettingsNav({
  items,
  label,
  className,
}: {
  items: readonly SettingsNavItem[];
  label: string;
  className?: string;
}) {
  const navItems: SectionNavItem[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    icon: ICONS[item.id] ?? UserRound,
    tone: item.id === 'settings-danger' ? 'danger' : 'default',
  }));

  return <SectionNav items={navItems} label={label} className={className} />;
}
