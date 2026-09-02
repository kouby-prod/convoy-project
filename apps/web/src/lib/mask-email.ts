/**
 * Masks an email address for display — "jo***@gmail.com" rather than the
 * full address, so it isn't readable at a glance (over someone's shoulder,
 * in a screen share) on the "check your inbox" screens. Never use this on
 * the address actually sent to the API (resend, sign-in, …) — only on what
 * gets rendered.
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return email;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visible = Math.min(local.length > 4 ? 3 : 2, local.length);

  return `${local.slice(0, visible)}***${domain}`;
}
