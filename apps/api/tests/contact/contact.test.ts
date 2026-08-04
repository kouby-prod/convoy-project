import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic: don't load the real env (would require a populated root .env and
// could point at a real SMTP server — see trajet.test.ts for why that matters).
vi.mock('../../src/env', () => ({
  env: { SUPPORT_EMAIL: 'support@example.test', EMAIL_FROM: 'no-reply@example.test' },
}));

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock('../../src/auth/email', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

// The rate limiter's buckets persist for the lifetime of the `contactModule`
// singleton, i.e. across every test in this file — mocked out so correctness
// tests below don't depend on execution order or how many requests ran
// before them. The limiter itself has dedicated coverage in
// apps/api/tests/middleware/rate-limit.test.ts.
vi.mock('../../src/middleware/rate-limit', () => ({
  rateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

import { contactModule } from '../../src/modules/contact';

const validBody = {
  name: 'Alex',
  email: 'alex@example.com',
  subject: 'Question about a booking',
  message: 'Can I change my seat count after booking?',
};

describe('contact module', () => {
  beforeEach(() => {
    sendEmail.mockReset();
  });

  describe('POST /contact', () => {
    it('forwards the message to the support inbox', async () => {
      sendEmail.mockResolvedValue(undefined);

      const res = await contactModule.request('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true });
      expect(sendEmail).toHaveBeenCalledWith({
        to: 'support@example.test',
        subject: expect.stringContaining('Question about a booking'),
        text: expect.stringContaining('Can I change my seat count after booking?'),
      });
      expect(sendEmail.mock.calls[0]?.[0].text).toContain('alex@example.com');
    });

    it('returns 502 when the email fails to send instead of silently succeeding', async () => {
      sendEmail.mockRejectedValue(new Error('SMTP down'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const res = await contactModule.request('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(502);
      consoleError.mockRestore();
    });

    it('rejects an invalid email', async () => {
      const res = await contactModule.request('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, email: 'not-an-email' }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects an empty message', async () => {
      const res = await contactModule.request('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, message: '' }),
      });
      expect(res.status).toBe(400);
    });
  });
});
