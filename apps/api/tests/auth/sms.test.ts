import { afterEach, describe, expect, it, vi } from 'vitest';

// Hermetic: don't load the real env (which would require a populated root .env).
vi.mock('../../src/env', () => ({
  env: {
    SMS_FROM: 'Test',
    SMS_GATEWAY_URL: undefined,
    SMS_GATEWAY_USER: undefined,
    SMS_GATEWAY_PASSWORD: undefined,
  },
}));

import { createGatewaySender } from '../../src/auth/sms';

describe('createGatewaySender', () => {
  afterEach(() => vi.restoreAllMocks());

  it('POSTs the SMSGate message shape with Basic auth', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const send = createGatewaySender({
      baseUrl: 'http://192.168.1.50:8080/', // trailing slash should be normalised
      user: 'alice',
      password: 's3cret',
    });
    await send({ to: '+33612345678', text: 'Your code is 123456' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://192.168.1.50:8080/message');
    expect(init?.method).toBe('POST');

    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    // base64("alice:s3cret")
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('alice:s3cret').toString('base64')}`);

    expect(JSON.parse(init?.body as string)).toEqual({
      textMessage: { text: 'Your code is 123456' },
      phoneNumbers: ['+33612345678'],
    });
  });

  it('throws when the gateway responds with a non-2xx status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('device offline', { status: 502 }),
    );

    const send = createGatewaySender({ baseUrl: 'http://192.168.1.50:8080' });
    await expect(send({ to: '+33612345678', text: 'hi' })).rejects.toThrow(/502/);
  });

  it('omits the Authorization header when no user is given', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const send = createGatewaySender({ baseUrl: 'http://192.168.1.50:8080' });
    await send({ to: '+1', text: 'x' });

    const headers = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});
