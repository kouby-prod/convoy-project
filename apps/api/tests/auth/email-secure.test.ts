import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/env', () => ({
  env: {
    SMTP_HOST: undefined,
    SMTP_PORT: 587,
    SMTP_SECURE: undefined,
    SMTP_USER: undefined,
    SMTP_PASS: undefined,
    EMAIL_FROM: 'no-reply@example.test',
  },
}));

import { smtpSecure } from '../../src/auth/email';

describe('smtpSecure', () => {
  it('uses TLS-on-connect for port 465 when the flag is unset', () => {
    expect(smtpSecure(465, undefined)).toBe(true);
  });

  it('does not force TLS-on-connect for port 587 when the flag is unset', () => {
    expect(smtpSecure(587, undefined)).toBe(false);
  });

  it('honours an explicit false even on port 465', () => {
    expect(smtpSecure(465, false)).toBe(false);
  });

  it('honours an explicit true on port 587', () => {
    expect(smtpSecure(587, true)).toBe(true);
  });
});
