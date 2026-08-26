import { afterEach, describe, expect, it, vi } from 'vitest';

// Hermetic: don't load the real env (which would require a populated root .env).
vi.mock('../../src/env', () => ({
  env: {
    VAPID_PUBLIC_KEY: undefined,
    VAPID_PRIVATE_KEY: undefined,
    VAPID_SUBJECT: 'mailto:support@carpool.local',
  },
}));

const setVapidDetails = vi.hoisted(() => vi.fn());
const sendNotification = vi.hoisted(() => vi.fn());
vi.mock('web-push', () => ({
  default: { setVapidDetails, sendNotification },
}));

import { consolePushSender, createVapidSender } from '../../src/modules/notification/push';

describe('consolePushSender', () => {
  it('resolves with no stale endpoints without calling any network API', async () => {
    const result = await consolePushSender(
      [{ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }],
      { title: 'Hi', body: 'Body', link: null },
    );
    expect(result).toEqual({ staleEndpoints: [] });
  });
});

describe('createVapidSender', () => {
  afterEach(() => vi.restoreAllMocks());

  it('configures VAPID details once and sends to every subscription', async () => {
    sendNotification.mockResolvedValue(undefined);
    const send = createVapidSender('pub-key', 'priv-key');

    const result = await send(
      [
        { endpoint: 'https://push.example/1', keys: { p256dh: 'p1', auth: 'a1' } },
        { endpoint: 'https://push.example/2', keys: { p256dh: 'p2', auth: 'a2' } },
      ],
      { title: 'Hi', body: 'Body', link: 'https://example.test/x' },
    );

    expect(setVapidDetails).toHaveBeenCalledWith('mailto:support@carpool.local', 'pub-key', 'priv-key');
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/1', keys: { p256dh: 'p1', auth: 'a1' } },
      JSON.stringify({ title: 'Hi', body: 'Body', link: 'https://example.test/x' }),
    );
    expect(result).toEqual({ staleEndpoints: [] });
  });

  it('collects endpoints the push service reports gone (404/410) instead of throwing', async () => {
    sendNotification
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 404 }))
      .mockResolvedValueOnce(undefined);
    const send = createVapidSender('pub-key', 'priv-key');

    const result = await send(
      [
        { endpoint: 'https://push.example/gone-410', keys: { p256dh: 'p1', auth: 'a1' } },
        { endpoint: 'https://push.example/gone-404', keys: { p256dh: 'p2', auth: 'a2' } },
        { endpoint: 'https://push.example/alive', keys: { p256dh: 'p3', auth: 'a3' } },
      ],
      { title: 'Hi', body: 'Body', link: null },
    );

    expect(result.staleEndpoints.sort()).toEqual(
      ['https://push.example/gone-404', 'https://push.example/gone-410'].sort(),
    );
  });

  it('logs and continues past a non-410/404 failure, without marking the endpoint stale', async () => {
    sendNotification
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { statusCode: 500 }))
      .mockResolvedValueOnce(undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const send = createVapidSender('pub-key', 'priv-key');

    const result = await send(
      [
        { endpoint: 'https://push.example/flaky', keys: { p256dh: 'p1', auth: 'a1' } },
        { endpoint: 'https://push.example/fine', keys: { p256dh: 'p2', auth: 'a2' } },
      ],
      { title: 'Hi', body: 'Body', link: null },
    );

    expect(result.staleEndpoints).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('https://push.example/flaky'),
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
