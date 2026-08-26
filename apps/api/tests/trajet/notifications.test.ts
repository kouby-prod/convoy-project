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

const publishNotificationCreated = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/notification/events', () => ({
  publishNotificationCreated: (...args: unknown[]) => publishNotificationCreated(...args),
}));

const sendWebPush = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/notification/push', () => ({
  sendWebPush: (...args: unknown[]) => sendWebPush(...args),
}));

const dbState = vi.hoisted(() => ({
  selectResult: [] as unknown[],
  // Queue for tests that need to control each of `notifyUser`'s three selects
  // (prefs, recipient email, push subscriptions) independently — each call
  // shifts one entry. Falls back to `selectResult` for every call when empty,
  // which is enough for tests that only care about email/insert side effects.
  selectQueue: [] as unknown[][],
  insertResult: [] as unknown[],
  insertValues: [] as unknown[],
  deleteWhereCalls: [] as unknown[],
}));

function createChain(result: unknown) {
  return {
    values: (values: unknown) => {
      dbState.insertValues.push(values);
      return { returning: () => Promise.resolve(result) };
    },
  };
}

const db = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: () => ({
      where: () =>
        Promise.resolve(dbState.selectQueue.length ? dbState.selectQueue.shift() : dbState.selectResult),
    }),
  })),
  insert: vi.fn(() => createChain(dbState.insertResult)),
  delete: vi.fn(() => ({
    where: (clause: unknown) => {
      dbState.deleteWhereCalls.push(clause);
      return Promise.resolve(undefined);
    },
  })),
}));
vi.mock('../../src/db/client', () => ({ db }));

import {
  notifyUser,
  trajetUrl,
  trajetSearchUrl,
  messagesUrl,
  paymentUrl,
  describeTrip,
  describeTripShort,
  truncateForPreview,
  formatDueAt,
} from '../../src/modules/trajet/notifications';

describe('notifyUser', () => {
  beforeEach(() => {
    sendEmail.mockReset();
    publishNotificationCreated.mockReset();
    publishNotificationCreated.mockResolvedValue(undefined);
    sendWebPush.mockReset();
    sendWebPush.mockResolvedValue({ staleEndpoints: [] });
    db.select.mockClear();
    db.insert.mockClear();
    db.delete.mockClear();
    dbState.selectResult = [];
    dbState.selectQueue = [];
    dbState.insertResult = [];
    dbState.insertValues = [];
    dbState.deleteWhereCalls = [];
  });

  it('sends an email to the looked-up user', async () => {
    dbState.selectResult = [{ email: 'driver@example.com' }];
    dbState.insertResult = [
      {
        id: 'notif-1',
        userId: 'u_1',
        title: 'Subject',
        body: 'Body',
        channel: 'email',
        type: 'system',
        link: null,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    await notifyUser('u_1', 'Subject', 'Body', { type: 'system' });

    expect(db.insert).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'driver@example.com',
      subject: 'Subject',
      text: 'Body',
    });
  });

  it('stores the type and link, and publishes the created notification', async () => {
    dbState.selectResult = [{ email: 'driver@example.com' }];
    const row = {
      id: 'notif-1',
      userId: 'u_1',
      title: 'Subject',
      body: 'Body',
      channel: 'email',
      type: 'booking_request',
      link: 'https://example.test/trajets/abc',
      readAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    dbState.insertResult = [row];

    await notifyUser('u_1', 'Subject', 'Body', {
      type: 'booking_request',
      link: 'https://example.test/trajets/abc',
    });

    expect(publishNotificationCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notif-1',
        type: 'booking_request',
        link: 'https://example.test/trajets/abc',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
  });

  it('stores `text` as the notification body when no `inAppBody` is given', async () => {
    dbState.selectResult = [{ email: 'driver@example.com' }];
    dbState.insertResult = [{ id: 'notif-1' }];

    await notifyUser('u_1', 'Subject', 'Full email body with a URL: https://example.test/x', {
      type: 'system',
    });

    expect(dbState.insertValues[0]).toMatchObject({
      body: 'Full email body with a URL: https://example.test/x',
    });
  });

  it('stores the shorter `inAppBody` instead of `text` when given, but still emails the full `text`', async () => {
    dbState.selectResult = [{ email: 'driver@example.com' }];
    dbState.insertResult = [{ id: 'notif-1' }];

    await notifyUser('u_1', 'Subject', 'Full email body with a URL: https://example.test/x', {
      type: 'system',
      inAppBody: 'Short in-app version',
    });

    expect(dbState.insertValues[0]).toMatchObject({ body: 'Short in-app version' });
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'driver@example.com',
      subject: 'Subject',
      text: 'Full email body with a URL: https://example.test/x',
    });
  });

  it('does nothing when the user cannot be found', async () => {
    dbState.selectResult = [];

    await notifyUser('missing', 'Subject', 'Body', { type: 'system' });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(publishNotificationCreated).not.toHaveBeenCalled();
  });

  it('logs and swallows an error from sendEmail instead of throwing', async () => {
    dbState.selectResult = [{ email: 'driver@example.com' }];
    dbState.insertResult = [
      {
        id: 'notif-1',
        userId: 'u_1',
        title: 'Subject',
        body: 'Body',
        channel: 'email',
        type: 'system',
        link: null,
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    sendEmail.mockRejectedValue(new Error('SMTP down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(notifyUser('u_1', 'Subject', 'Body', { type: 'system' })).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('pushes to every subscribed browser, keyed by endpoint', async () => {
    dbState.selectQueue = [
      [{ emailEnabled: true, inAppEnabled: true, pushEnabled: true }],
      [{ email: 'driver@example.com' }],
      [
        { endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
        { endpoint: 'https://push.example/2', p256dh: 'p2', auth: 'a2' },
      ],
    ];
    dbState.insertResult = [{ id: 'notif-1' }];

    await notifyUser('u_1', 'Subject', 'Full body', {
      type: 'booking_request',
      inAppBody: 'Short body',
      link: 'https://example.test/trajet/abc',
    });

    expect(sendWebPush).toHaveBeenCalledWith(
      [
        { endpoint: 'https://push.example/1', keys: { p256dh: 'p1', auth: 'a1' } },
        { endpoint: 'https://push.example/2', keys: { p256dh: 'p2', auth: 'a2' } },
      ],
      { title: 'Subject', body: 'Short body', link: 'https://example.test/trajet/abc' },
    );
  });

  it('skips push entirely when pushEnabled is false, without querying subscriptions', async () => {
    dbState.selectQueue = [
      [{ emailEnabled: true, inAppEnabled: true, pushEnabled: false }],
      [{ email: 'driver@example.com' }],
    ];
    dbState.insertResult = [{ id: 'notif-1' }];

    await notifyUser('u_1', 'Subject', 'Body', { type: 'system' });

    expect(sendWebPush).not.toHaveBeenCalled();
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('does not call the push service when the user has no subscriptions', async () => {
    dbState.selectQueue = [
      [{ emailEnabled: true, inAppEnabled: true, pushEnabled: true }],
      [{ email: 'driver@example.com' }],
      [],
    ];
    dbState.insertResult = [{ id: 'notif-1' }];

    await notifyUser('u_1', 'Subject', 'Body', { type: 'system' });

    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it('deletes subscriptions the push service reports as gone', async () => {
    dbState.selectQueue = [
      [{ emailEnabled: true, inAppEnabled: true, pushEnabled: true }],
      [{ email: 'driver@example.com' }],
      [{ endpoint: 'https://push.example/dead', p256dh: 'p1', auth: 'a1' }],
    ];
    dbState.insertResult = [{ id: 'notif-1' }];
    sendWebPush.mockResolvedValue({ staleEndpoints: ['https://push.example/dead'] });

    await notifyUser('u_1', 'Subject', 'Body', { type: 'system' });

    expect(db.delete).toHaveBeenCalled();
  });

  it('logs and swallows an error from sendWebPush instead of throwing', async () => {
    dbState.selectQueue = [
      [{ emailEnabled: true, inAppEnabled: true, pushEnabled: true }],
      [{ email: 'driver@example.com' }],
      [{ endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' }],
    ];
    dbState.insertResult = [{ id: 'notif-1' }];
    sendWebPush.mockRejectedValue(new Error('push service down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(notifyUser('u_1', 'Subject', 'Body', { type: 'system' })).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does nothing on any channel when every preference is off', async () => {
    dbState.selectQueue = [[{ emailEnabled: false, inAppEnabled: false, pushEnabled: false }]];

    await notifyUser('u_1', 'Subject', 'Body', { type: 'system' });

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWebPush).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('trajetUrl / trajetSearchUrl / messagesUrl / describeTrip', () => {
  it('builds links from the web app origin', () => {
    expect(trajetUrl('abc-123')).toBe('https://example.test/trajet/abc-123');
    expect(trajetSearchUrl()).toBe('https://example.test/trajets');
    expect(paymentUrl('book-1')).toBe('https://example.test/paiement/book-1');
    expect(messagesUrl('booking-1')).toBe('https://example.test/messages/booking-1');
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

  it('describes a trip briefly, without a technical GMT/UTC timestamp', () => {
    const departureAt = new Date('2026-08-11T16:10:00.000Z');
    const short = describeTripShort({ departureCity: 'Montreal', arrivalCity: 'Quebec', departureAt });
    expect(short).toContain('Montreal → Quebec');
    expect(short).not.toContain('GMT');
    expect(short).not.toContain('UTC');
  });
});

describe('truncateForPreview', () => {
  it('returns short text unchanged', () => {
    expect(truncateForPreview('Hi there')).toBe('Hi there');
  });

  it('truncates long text with an ellipsis', () => {
    const long = 'a'.repeat(100);
    const result = truncateForPreview(long, 80);
    expect(result).toHaveLength(81);
    expect(result.endsWith('…')).toBe(true);
  });
});
