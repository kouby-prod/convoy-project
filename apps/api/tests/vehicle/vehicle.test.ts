import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hermetic: fake the Drizzle query builder so no real database is needed.
 * Each chain method returns `this`; the chain is also "thenable" so `await`
 * resolves at whatever point the code stops chaining.
 */
function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    values: () => chain,
    set: () => chain,
    onConflictDoUpdate: () => chain,
    returning: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const dbState = vi.hoisted(() => ({
  selectResult: [] as unknown[],
  insertResult: [] as unknown[],
  updateResult: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  select: vi.fn(() => createChain(dbState.selectResult)),
  insert: vi.fn(() => createChain(dbState.insertResult)),
  update: vi.fn(() => createChain(dbState.updateResult)),
}));

vi.mock('../../src/db/client', () => ({ db }));

// Mock BetterAuth so protected routes can be exercised without real sessions.
const getSession = vi.fn();
vi.mock('../../src/auth/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

/**
 * Only the S3 *client* is mocked — it needs credentials and a live endpoint.
 * The key rules (`buildStorageKey` / `isKeyOwnedBy`) live in src/storage/keys.ts
 * and run for real here, same as tests/document/document.test.ts.
 */
const storage = vi.hoisted(() => ({ objectExists: vi.fn() }));
vi.mock('../../src/storage/s3', () => ({
  createUploadUrl: (key: string) => Promise.resolve(`https://bucket.test/${key}?sig=put`),
  createViewUrl: (key: string) => Promise.resolve(`https://bucket.test/${key}?sig=get`),
  objectExists: storage.objectExists,
  URL_TTL_SECONDS: 300,
}));

import { vehicleModule } from '../../src/modules/vehicle';

function sessionFor(id: string) {
  return {
    user: {
      id,
      email: `${id}@example.com`,
      name: 'Ada Lovelace',
      emailVerified: true,
      role: null,
      phoneNumber: null,
      phoneNumberVerified: false,
    },
    session: { id: 's_1', userId: id, token: 'tok' },
  };
}

const now = new Date();

function makeVehicleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ownerId: 'driver_1',
    make: 'Toyota',
    model: 'Corolla',
    color: 'Blue',
    seats: 4,
    plate: 'ABC123',
    hasInsurance: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('vehicle module', () => {
  beforeEach(() => {
    dbState.selectResult = [];
    dbState.insertResult = [];
    dbState.updateResult = [];
    db.select.mockClear();
    db.insert.mockClear();
    db.update.mockClear();
    getSession.mockReset();
    storage.objectExists.mockReset();
    storage.objectExists.mockResolvedValue(true);
  });

  it('GET /vehicles/me returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await vehicleModule.request('/vehicles/me');
    expect(res.status).toBe(401);
  });

  it('GET /vehicles/me returns 404 when nothing declared yet', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.selectResult = [];
    const res = await vehicleModule.request('/vehicles/me');
    expect(res.status).toBe(404);
  });

  it('GET /vehicles/me returns the declared vehicle', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.selectResult = [makeVehicleRow()];
    const res = await vehicleModule.request('/vehicles/me');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ownerId: 'driver_1',
      make: 'Toyota',
      model: 'Corolla',
      color: 'Blue',
      seats: 4,
      plate: 'ABC123',
    });
  });

  it('PUT /vehicles/me returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await vehicleModule.request('/vehicles/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ make: 'Toyota', model: 'Corolla', color: 'Blue', seats: 4, plate: 'ABC123' }),
    });
    expect(res.status).toBe(401);
  });

  it('PUT /vehicles/me upserts and returns the saved vehicle', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.insertResult = [makeVehicleRow({ color: 'Red' })];
    const res = await vehicleModule.request('/vehicles/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        make: 'Toyota',
        model: 'Corolla',
        color: 'Red',
        seats: 4,
        plate: 'ABC123',
        hasInsurance: true,
      }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ownerId: 'driver_1', color: 'Red' });
  });

  it('PUT /vehicles/me accepts hasInsurance: null (not yet declared)', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.insertResult = [makeVehicleRow({ hasInsurance: null })];
    const res = await vehicleModule.request('/vehicles/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        make: 'Toyota',
        model: 'Corolla',
        color: 'Blue',
        seats: 4,
        plate: 'ABC123',
        hasInsurance: null,
      }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ownerId: 'driver_1', hasInsurance: null });
  });

  it('GET /vehicles/me reports hasPhoto: false when no photo was uploaded', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.selectResult = [makeVehicleRow({ photoKey: null })];
    const res = await vehicleModule.request('/vehicles/me');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ hasPhoto: false });
  });

  it('GET /vehicles/me reports hasPhoto: true, without leaking the storage key', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.selectResult = [makeVehicleRow({ photoKey: 'documents/driver_1/abc-car.jpg' })];
    const res = await vehicleModule.request('/vehicles/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ hasPhoto: true });
    expect(body).not.toHaveProperty('photoKey');
  });

  /* ────────────────────── The optional vehicle photo ─────────────────────── */

  it('POST /vehicles/me/photo-upload-url returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await vehicleModule.request('/vehicles/me/photo-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'car.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /vehicles/me/photo-upload-url signs a key inside the caller's namespace", async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    const res = await vehicleModule.request('/vehicles/me/photo-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'car.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploadUrl: string; storageKey: string };
    expect(body.storageKey.startsWith('documents/driver_1/')).toBe(true);
    expect(body.uploadUrl).toContain(body.storageKey);
  });

  function putPhoto(overrides: Partial<Record<string, unknown>> = {}) {
    return vehicleModule.request('/vehicles/me/photo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storageKey: 'documents/driver_1/abc-car.jpg',
        fileName: 'car.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        ...overrides,
      }),
    });
  }

  it('PUT /vehicles/me/photo returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await putPhoto();
    expect(res.status).toBe(401);
  });

  it("PUT /vehicles/me/photo refuses a key from another driver's namespace", async () => {
    getSession.mockResolvedValue(sessionFor('driver_2'));
    const res = await putPhoto();
    expect(res.status).toBe(400);
    expect(storage.objectExists).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('PUT /vehicles/me/photo refuses a key whose object never landed', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    storage.objectExists.mockResolvedValue(false);
    const res = await putPhoto();
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('PUT /vehicles/me/photo refuses to attach a photo before the vehicle exists', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.updateResult = []; // nothing matched `.where(eq(vehicle.ownerId, ...))`
    const res = await putPhoto();
    expect(res.status).toBe(400);
  });

  it('PUT /vehicles/me/photo attaches the photo and reports hasPhoto: true', async () => {
    getSession.mockResolvedValue(sessionFor('driver_1'));
    dbState.updateResult = [makeVehicleRow({ photoKey: 'documents/driver_1/abc-car.jpg' })];
    const res = await putPhoto();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ownerId: 'driver_1', hasPhoto: true });
  });

  it('GET /vehicle-photos/:ownerId returns 404 when no vehicle is declared', async () => {
    dbState.selectResult = [];
    const res = await vehicleModule.request('/vehicle-photos/driver_1');
    expect(res.status).toBe(404);
  });

  it('GET /vehicle-photos/:ownerId returns 404 when the vehicle has no photo', async () => {
    dbState.selectResult = [makeVehicleRow({ photoKey: null })];
    const res = await vehicleModule.request('/vehicle-photos/driver_1');
    expect(res.status).toBe(404);
  });

  it('GET /vehicle-photos/:ownerId signs a view URL, with no session required', async () => {
    // No getSession mock set up at all — this route must not require one.
    dbState.selectResult = [makeVehicleRow({ photoKey: 'documents/driver_1/abc-car.jpg' })];
    const res = await vehicleModule.request('/vehicle-photos/driver_1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { viewUrl: string; expiresInSeconds: number };
    expect(body.viewUrl).toContain('documents/driver_1/abc-car.jpg');
    expect(body.expiresInSeconds).toBe(300);
  });
});
