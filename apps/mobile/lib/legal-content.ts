// Legal/info copy is authored once, in the web app's `fr.json` (next-intl
// namespaces), and read here rather than retyped — this is legal text (CGU,
// CGV, contrat conducteur, politique de confidentialité): a second
// hand-copied version would risk silently drifting from the reviewed
// original. Metro already watches the whole monorepo (see metro.config.js),
// so this relative import resolves like any other file.
import fr from '../../web/messages/fr.json';

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

export function legalContentFor(slug: LegalSlug): LegalContent {
  return fr[NAMESPACE_BY_SLUG[slug]] as unknown as LegalContent;
}

export interface ChecklistCopy {
  title: string;
  lastUpdated: string;
  loading: string;
  progress: (done: number, total: number) => string;
  guide: string;
  sections: LegalSection[];
}

const becomeDriverRaw = fr.BecomeDriver;
const becomePassengerRaw = fr.BecomePassenger;

export const BECOME_DRIVER: ChecklistCopy & {
  account: { title: string; description: string; signIn: string; signUp: string };
  documents: { title: string; description: string; cta: string; doneCta: string };
  vehicle: { title: string; description: string; cta: string; doneCta: string };
  publish: { title: string; description: string; cta: string; doneCta: string };
} = {
  title: becomeDriverRaw.title,
  lastUpdated: becomeDriverRaw.lastUpdated,
  loading: becomeDriverRaw.checklist.loading,
  progress: (done, total) => becomeDriverRaw.checklist.progress.replace('{done}', String(done)).replace('{total}', String(total)),
  guide: becomeDriverRaw.checklist.guide,
  sections: becomeDriverRaw.sections,
  account: becomeDriverRaw.checklist.account,
  documents: becomeDriverRaw.checklist.documents,
  vehicle: becomeDriverRaw.checklist.vehicle,
  publish: becomeDriverRaw.checklist.publish,
};

export const BECOME_PASSENGER: ChecklistCopy & {
  account: { title: string; description: string; signIn: string; signUp: string };
  search: { title: string; description: string; cta: string };
  booking: { title: string; description: string; cta: string; doneCta: string };
} = {
  title: becomePassengerRaw.title,
  lastUpdated: becomePassengerRaw.lastUpdated,
  loading: becomePassengerRaw.checklist.loading,
  progress: (done, total) =>
    becomePassengerRaw.checklist.progress.replace('{done}', String(done)).replace('{total}', String(total)),
  guide: becomePassengerRaw.checklist.guide,
  sections: becomePassengerRaw.sections,
  account: becomePassengerRaw.checklist.account,
  search: becomePassengerRaw.checklist.search,
  booking: becomePassengerRaw.checklist.booking,
};
