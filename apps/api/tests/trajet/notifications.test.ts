import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic: don't load the real env (which would require a populated root
// .env and could point at a real SMTP server — see trajet.test.ts for why
// that matters).
vi.mock('../../src/env', () => ({
  env: { TRUSTED_ORIGINS: ['https://example.test'] },
}));

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock('../../src/auth/email', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

const dbState = vi.hoisted(() => ({ selectResult: [] as unknown[] }));
const db = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: () => ({
      where: () => Promise.resolve(dbState.selectResult),
    }),
  })),
}));
vi.mock('../../src/db/client', () => ({ db }));

import { notifyUser, trajetUrl, trajetSearchUrl, describeTrip, paymentUrl, formatDueAt } from '../../src/modules/trajet/notifications';

describe('notifyUser', () => {
  beforeEach(() => {
    sendEmail.mockReset();
    db.select.mockClear();
    dbState.selectResult = [];
  });

  it('sends an email to the looked-up user', async () => {
    dbState.selectResult = [{ email: 'driver@example.com' }];

    await notifyUser('u_1', 'Subject', 'Body');

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'driver@example.com',
      subject: 'Subject',
      text: 'Body',
    });
  });

  it('does nothing when the user cannot be found', async () => {
    dbState.selectResult = [];

    await notifyUser('missing', 'Subject', 'Body');

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('logs and swallows an error from sendEmail instead of throwing', async () => {
    dbState.selectResult = [{ email: 'driver@example.com' }];
    sendEmail.mockRejectedValue(new Error('SMTP down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(notifyUser('u_1', 'Subject', 'Body')).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('trajetUrl / trajetSearchUrl / describeTrip', () => {
  it('builds links from the web app origin', () => {
    expect(trajetUrl('abc-123')).toBe('https://example.test/trajet/abc-123');
    expect(trajetSearchUrl()).toBe('https://example.test/trajets');
    expect(paymentUrl('book-1')).toBe('https://example.test/paiement/book-1');
  });

  it('formats a due date in Eastern time', () => {
    expect(formatDueAt('2026-08-21T16:00:00.000Z')).toMatch(/2026/);
  });

  it('describes a trip', () => {
    const departureAt = new Date('2026-01-01T10:00:00.000Z');
    expect(
      describeTrip({ departureCity: 'Montreal', arrivalCity: 'Quebec', departureAt }),
    ).toBe(`Montreal to Quebec (departing ${departureAt.toUTCString()})`);
  });
});
