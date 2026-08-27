/** BetterAuth returns this when `requireEmailVerification` blocks sign-in — mirrors the web's `lib/auth-errors.ts`. */
export function isEmailNotVerified(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === 'EMAIL_NOT_VERIFIED') return true;
  return typeof error.message === 'string' && /email not verified/i.test(error.message);
}
