// Legal/info copy is authored once, in the web app's `fr.json`/`en.json`
// (next-intl namespaces), and read here rather than retyped — this is legal
// text (CGU, CGV, contrat conducteur, politique de confidentialité): a second
// hand-copied version would risk silently drifting from the reviewed
// original, in either language. Metro already watches the whole monorepo
// (see metro.config.js), so these relative imports resolve like any other
// file. Both locale files declare the exact same namespaces (checked once,
// see docs/requirements-specification-audit.md history), so picking one by
// the app's current locale is safe.
import fr from '../../web/messages/fr.json';
import en from '../../web/messages/en.json';
import type { Locale } from './i18n';

const MESSAGES_BY_LOCALE = { fr, en } satisfies Record<Locale, typeof fr>;

export interface LegalSection {
  heading: string;
  body: string;
}

export interface LegalContent {
  title: string;
  lastUpdated: string;
  disclaimer?: string;
  sections: LegalSection[];
}

export const LEGAL_SLUGS = [
  'terms',
  'cgv',
  'contrat-conducteur',
  'privacy',
  'mentions-legales',
  'responsibility',
  'driver-tips',
  'passenger-tips',
] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

const NAMESPACE_BY_SLUG: Record<LegalSlug, keyof typeof fr> = {
  terms: 'Terms',
  cgv: 'Cgv',
  'contrat-conducteur': 'ContratConducteur',
  privacy: 'Privacy',
  'mentions-legales': 'MentionsLegales',
  responsibility: 'Responsibility',
  'driver-tips': 'DriverTips',
  'passenger-tips': 'PassengerTips',
};

export function legalContentFor(slug: LegalSlug, locale: Locale): LegalContent {
  return MESSAGES_BY_LOCALE[locale][NAMESPACE_BY_SLUG[slug]] as unknown as LegalContent;
}

export interface ChecklistCopy {
  title: string;
  lastUpdated: string;
  loading: string;
  progress: (done: number, total: number) => string;
  guide: string;
  sections: LegalSection[];
}

export function getBecomeDriverContent(locale: Locale): ChecklistCopy & {
  account: { title: string; description: string; signIn: string; signUp: string };
  documents: { title: string; description: string; cta: string; doneCta: string };
  vehicle: { title: string; description: string; cta: string; doneCta: string };
  publish: { title: string; description: string; cta: string; doneCta: string };
} {
  const raw = MESSAGES_BY_LOCALE[locale].BecomeDriver;
  return {
    title: raw.title,
    lastUpdated: raw.lastUpdated,
    loading: raw.checklist.loading,
    progress: (done, total) => raw.checklist.progress.replace('{done}', String(done)).replace('{total}', String(total)),
    guide: raw.checklist.guide,
    sections: raw.sections,
    account: raw.checklist.account,
    documents: raw.checklist.documents,
    vehicle: raw.checklist.vehicle,
    publish: raw.checklist.publish,
  };
}

export function getBecomePassengerContent(locale: Locale): ChecklistCopy & {
  account: { title: string; description: string; signIn: string; signUp: string };
  search: { title: string; description: string; cta: string };
  booking: { title: string; description: string; cta: string; doneCta: string };
} {
  const raw = MESSAGES_BY_LOCALE[locale].BecomePassenger;
  return {
    title: raw.title,
    lastUpdated: raw.lastUpdated,
    loading: raw.checklist.loading,
    progress: (done, total) => raw.checklist.progress.replace('{done}', String(done)).replace('{total}', String(total)),
    guide: raw.checklist.guide,
    sections: raw.sections,
    account: raw.checklist.account,
    search: raw.checklist.search,
    booking: raw.checklist.booking,
  };
}
