/** Locales the web app actually ships. French is the default URL (no prefix). */
export type AuthMailLocale = 'fr' | 'en';

const COPY = {
  fr: {
    verify: {
      subject: 'Vérifiez votre courriel Convoy',
      heading: 'Vérifiez votre adresse e-mail',
      intro: (email: string) =>
        `Confirmez que ${email} est bien la vôtre pour activer votre compte Convoy.`,
      cta: 'Vérifier l’e-mail',
      fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
      footer: 'Ce lien expire bientôt. Si vous n’êtes pas à l’origine de cette inscription, ignorez ce message.',
    },
    reset: {
      subject: 'Réinitialisez votre mot de passe Convoy',
      heading: 'Réinitialiser le mot de passe',
      intro: 'Cliquez sur le bouton pour choisir un nouveau mot de passe Convoy.',
      cta: 'Choisir un mot de passe',
      fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
      footer: 'Si vous n’avez pas demandé cette réinitialisation, ignorez ce message.',
    },
  },
  en: {
    verify: {
      subject: 'Verify your Convoy email',
      heading: 'Verify your email address',
      intro: (email: string) => `Confirm that ${email} is yours to activate your Convoy account.`,
      cta: 'Verify email',
      fallback: 'If the button does not work, copy this link into your browser:',
      footer: 'This link expires soon. If you did not create an account, ignore this message.',
    },
    reset: {
      subject: 'Reset your Convoy password',
      heading: 'Reset your password',
      intro: 'Click the button to choose a new Convoy password.',
      cta: 'Choose a password',
      fallback: 'If the button does not work, copy this link into your browser:',
      footer: 'If you did not ask to reset your password, ignore this message.',
    },
  },
} as const;

export interface AuthEmailContent {
  subject: string;
  text: string;
  html: string;
}

/** Escape text that will sit in HTML (names, emails, URLs in attributes). */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * BetterAuth puts the web return path in `callbackURL` on both verify and
 * reset links. `/en/...` is English; everything else (including `/auth/...`)
 * is French, matching `localePrefix: 'as-needed'`.
 */
export function localeFromAuthUrl(authUrl: string): AuthMailLocale {
  try {
    const parsed = new URL(authUrl);
    const raw = parsed.searchParams.get('callbackURL');
    if (!raw) return 'fr';
    const pathname = raw.startsWith('http://') || raw.startsWith('https://')
      ? new URL(raw).pathname
      : raw.startsWith('/')
        ? raw
        : `/${raw}`;
    if (pathname === '/en' || pathname.startsWith('/en/')) return 'en';
    return 'fr';
  } catch {
    return 'fr';
  }
}

function brandedHtml(opts: {
  locale: AuthMailLocale;
  heading: string;
  intro: string;
  cta: string;
  url: string;
  fallback: string;
  footer: string;
}): string {
  const url = escapeHtml(opts.url);
  return `<!doctype html>
<html lang="${opts.locale}">
<body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1e8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;padding:32px 28px;">
          <tr>
            <td style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#26b053;">Convoy</td>
          </tr>
          <tr>
            <td style="padding-top:16px;font-size:22px;font-weight:700;line-height:1.3;">${escapeHtml(opts.heading)}</td>
          </tr>
          <tr>
            <td style="padding-top:12px;font-size:15px;line-height:1.5;color:#3f3f3f;">${escapeHtml(opts.intro)}</td>
          </tr>
          <tr>
            <td style="padding-top:24px;">
              <a href="${url}" style="display:inline-block;background:#26b053;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:6px;">${escapeHtml(opts.cta)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;font-size:13px;line-height:1.5;color:#5c5c5c;">${escapeHtml(opts.fallback)}</td>
          </tr>
          <tr>
            <td style="padding-top:8px;font-size:13px;line-height:1.5;word-break:break-all;">
              <a href="${url}" style="color:#187eb3;">${url}</a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:28px;font-size:12px;line-height:1.5;color:#6b6b6b;">${escapeHtml(opts.footer)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function brandedText(opts: { intro: string; cta: string; url: string; fallback: string; footer: string }): string {
  return [
    'Convoy',
    '',
    opts.intro,
    '',
    `${opts.cta}: ${opts.url}`,
    '',
    opts.fallback,
    opts.url,
    '',
    opts.footer,
  ].join('\n');
}

export function verificationEmail(opts: {
  email: string;
  url: string;
  locale: AuthMailLocale;
}): AuthEmailContent {
  const copy = COPY[opts.locale].verify;
  const intro = copy.intro(opts.email);
  return {
    subject: copy.subject,
    text: brandedText({ intro, cta: copy.cta, url: opts.url, fallback: copy.fallback, footer: copy.footer }),
    html: brandedHtml({
      locale: opts.locale,
      heading: copy.heading,
      intro,
      cta: copy.cta,
      url: opts.url,
      fallback: copy.fallback,
      footer: copy.footer,
    }),
  };
}

export function resetPasswordEmail(opts: { url: string; locale: AuthMailLocale }): AuthEmailContent {
  const copy = COPY[opts.locale].reset;
  return {
    subject: copy.subject,
    text: brandedText({
      intro: copy.intro,
      cta: copy.cta,
      url: opts.url,
      fallback: copy.fallback,
      footer: copy.footer,
    }),
    html: brandedHtml({
      locale: opts.locale,
      heading: copy.heading,
      intro: copy.intro,
      cta: copy.cta,
      url: opts.url,
      fallback: copy.fallback,
      footer: copy.footer,
    }),
  };
}
