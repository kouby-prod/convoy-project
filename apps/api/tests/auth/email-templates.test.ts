import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  localeFromAuthUrl,
  resetPasswordEmail,
  verificationEmail,
} from '../../src/auth/email-templates';

describe('localeFromAuthUrl', () => {
  it('reads English from a prefixed web callback', () => {
    const url =
      'http://localhost:3001/api/auth/verify-email?token=abc&callbackURL=' +
      encodeURIComponent('http://localhost:3000/en/auth/verified');
    expect(localeFromAuthUrl(url)).toBe('en');
  });

  it('defaults French when the web callback has no locale prefix', () => {
    const url =
      'http://localhost:3001/api/auth/verify-email?token=abc&callbackURL=' +
      encodeURIComponent('http://localhost:3000/auth/verified');
    expect(localeFromAuthUrl(url)).toBe('fr');
  });

  it('defaults French when callbackURL is missing or the URL is junk', () => {
    expect(localeFromAuthUrl('http://localhost:3001/api/auth/verify-email?token=abc')).toBe('fr');
    expect(localeFromAuthUrl('not a url')).toBe('fr');
  });

  it('still reads English when the verified page carries a ?next= return path', () => {
    const url =
      'http://localhost:3001/api/auth/verify-email?token=abc&callbackURL=' +
      encodeURIComponent('http://localhost:3000/en/auth/verified?next=%2Ftrajet%2Fabc');
    expect(localeFromAuthUrl(url)).toBe('en');
  });
});

describe('verificationEmail', () => {
  const url = 'https://api.example.com/api/auth/verify-email?token=t&callbackURL=/en/auth/verified';

  it('is Convoy-branded French by default, never Carpool', () => {
    const mail = verificationEmail({ email: 'a@b.test', url, locale: 'fr' });
    expect(mail.subject).toBe('Vérifiez votre courriel Convoy');
    expect(mail.text).toContain(url);
    expect(mail.text).toContain('a@b.test');
    expect(mail.html).toContain(escapeHtml(url));
    expect(mail.html).toContain('lang="fr"');
    expect(`${mail.subject}${mail.text}${mail.html}`).not.toMatch(/carpool/i);
  });

  it('switches copy for English', () => {
    const mail = verificationEmail({ email: 'a@b.test', url, locale: 'en' });
    expect(mail.subject).toBe('Verify your Convoy email');
    expect(mail.html).toContain('lang="en"');
    expect(mail.html).toContain('Verify email');
  });

  it('HTML-escapes the address so a crafted email cannot break the layout', () => {
    const mail = verificationEmail({
      email: 'a<b@c.test',
      url,
      locale: 'en',
    });
    expect(mail.html).toContain('a&lt;b@c.test');
    expect(mail.html).not.toContain('a<b@c.test');
  });
});

describe('resetPasswordEmail', () => {
  it('keeps the reset link in both text and html', () => {
    const url = 'https://api.example.com/api/auth/reset-password/tok?callbackURL=https://example.com/auth/reset-password';
    const mail = resetPasswordEmail({ url, locale: 'fr' });
    expect(mail.subject).toContain('Convoy');
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(escapeHtml(url));
    expect(`${mail.subject}${mail.text}${mail.html}`).not.toMatch(/carpool/i);
  });
});
