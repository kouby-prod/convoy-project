import { describe, expect, it, vi } from 'vitest';
import { createAuthSecondaryStorage } from '../../src/auth/secondary-storage';

type RedisStub = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  getdel: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
};

function stubRedis(overrides: Partial<RedisStub> = {}): RedisStub {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    getdel: vi.fn().mockResolvedValue(null),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ...overrides,
  };
}

describe('createAuthSecondaryStorage', () => {
  it('namespaces keys so they never collide with BullMQ', async () => {
    const redis = stubRedis({ get: vi.fn().mockResolvedValue('cached') });
    const storage = createAuthSecondaryStorage(redis as never);

    await expect(storage.get('session:abc')).resolves.toBe('cached');
    expect(redis.get).toHaveBeenCalledWith('better-auth:session:abc');
  });

  it('sets with EX when a TTL is given, and without when it is not', async () => {
    const redis = stubRedis();
    const storage = createAuthSecondaryStorage(redis as never);

    await storage.set('k', 'v', 60);
    expect(redis.set).toHaveBeenCalledWith('better-auth:k', 'v', 'EX', 60);

    await storage.set('k', 'v');
    expect(redis.set).toHaveBeenLastCalledWith('better-auth:k', 'v');
  });

  it('getAndDelete uses GETDEL', async () => {
    const redis = stubRedis({ getdel: vi.fn().mockResolvedValue('once') });
    const storage = createAuthSecondaryStorage(redis as never);

    await expect(storage.getAndDelete('token')).resolves.toBe('once');
    expect(redis.getdel).toHaveBeenCalledWith('better-auth:token');
  });

  it('increment sets TTL only on the first count in the window', async () => {
    const redis = stubRedis({ incr: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2) });
    const storage = createAuthSecondaryStorage(redis as never);

    await expect(storage.increment('rl', 10)).resolves.toBe(1);
    expect(redis.expire).toHaveBeenCalledWith('better-auth:rl', 10);

    await expect(storage.increment('rl', 10)).resolves.toBe(2);
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it('delete removes the namespaced key', async () => {
    const redis = stubRedis();
    const storage = createAuthSecondaryStorage(redis as never);
    await storage.delete('session:abc');
    expect(redis.del).toHaveBeenCalledWith('better-auth:session:abc');
  });
});
