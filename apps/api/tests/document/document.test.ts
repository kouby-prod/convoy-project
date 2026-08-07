import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hermetic: fake the Drizzle query builder so no real database is needed.
 * Each chain method returns `this`; the chain is also "thenable" so `await`
 * resolves at whatever point the code stops chaining (mirrors how the real
 * query builder works).
 */
function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    groupBy: () => chain,
    orderBy: () => chain,
    where: () => chain,
    values: () => chain,
    set: () => chain,
    returning: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const dbState = vi.hoisted(() => ({
  selectResult: [] as unknown[],
  insertResult: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  select: vi.fn(() => createChain(dbState.selectResult)),
  insert: vi.fn(() => createChain(dbState.insertResult)),
  update: vi.fn(() => createChain(undefined)),
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
 * and run for real here, because they are what decides who may claim an upload.
 */
const storage = vi.hoisted(() => ({ objectExists: vi.fn() }));
vi.mock('../../src/storage/s3', () => ({
  createUploadUrl: (key: string) => Promise.resolve(`https://bucket.test/${key}?sig=put`),
  createViewUrl: (key: string) => Promise.resolve(`https://bucket.test/${key}?sig=get`),
  objectExists: storage.objectExists,
  URL_TTL_SECONDS: 300,
}));

import { documentModule } from '../../src/modules/document';

function sessionFor(id: string, role: string | null) {
  return {
    user: {
      id,
      email: `${id}@example.com`,
      name: 'Ada Lovelace',
      emailVerified: true,
      role,
      phoneNumber: null,
      phoneNumberVerified: false,
    },
    session: { id: 's_1', userId: id, token: 'tok' },
  };
}

const now = new Date();
const DOC_ID = '11111111-1111-4111-8111-111111111111';

function makeDocumentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DOC_ID,
    ownerId: 'u_1',
    type: 'permis',
    status: 'pending',
    storageKey: 'documents/u_1/abc-permis.jpg',
    fileName: 'permis.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    expiresOn: null,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    submittedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** A valid `CreateDocument` body, for a key that really belongs to `u_1`. */
function createBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: 'permis',
    storageKey: 'documents/u_1/abc-permis.jpg',
    fileName: 'permis.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    ...overrides,
  };
}

function postJson(path: string, body: unknown) {
  return documentModule.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('document module', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.insert.mockClear();
    getSession.mockReset();
    storage.objectExists.mockReset();
    storage.objectExists.mockResolvedValue(true);
    dbState.selectResult = [];
    dbState.insertResult = [];
  });

  /* ──────────────────── Step 1: signing an upload URL ─────────────────── */

  it('POST /documents/upload-url returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await postJson('/documents/upload-url', {
      type: 'permis',
      fileName: 'permis.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });
    expect(res.status).toBe(401);
  });

  it("POST /documents/upload-url signs a key inside the caller's namespace", async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    const res = await postJson('/documents/upload-url', {
      type: 'permis',
      fileName: 'permis.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploadUrl: string; storageKey: string };
    // The namespace is the whole security story for step 3 — assert it directly.
    expect(body.storageKey.startsWith('documents/u_1/')).toBe(true);
    expect(body.uploadUrl).toContain(body.storageKey);
  });

  it('POST /documents/upload-url rejects a file over the size cap', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    const res = await postJson('/documents/upload-url', {
      type: 'permis',
      fileName: 'permis.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 50 * 1024 * 1024,
    });
    expect(res.status).toBe(400);
  });

  it('POST /documents/upload-url rejects an unsupported file type', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    const res = await postJson('/documents/upload-url', {
      type: 'permis',
      fileName: 'permis.exe',
      mimeType: 'application/x-msdownload',
      sizeBytes: 1024,
    });
    expect(res.status).toBe(400);
  });

  it('POST /documents/upload-url sanitises the file name into the key', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    const res = await postJson('/documents/upload-url', {
      type: 'permis',
      fileName: '../../etc/passwd.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });

    expect(res.status).toBe(200);
    const { storageKey } = (await res.json()) as { storageKey: string };
    // A traversal attempt must not survive into the key.
    expect(storageKey.startsWith('documents/u_1/')).toBe(true);
    expect(storageKey).not.toContain('..');
    expect(storageKey).not.toContain('/etc/');
  });

  /* ──────────────────── Step 3: recording the submission ──────────────── */

  it('POST /documents returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await postJson('/documents', createBody());
    expect(res.status).toBe(401);
  });

  it("POST /documents refuses a key from another driver's namespace", async () => {
    getSession.mockResolvedValue(sessionFor('u_2', 'user'));
    // u_2 quotes a key minted for u_1 — the one attack this handshake must stop.
    const res = await postJson('/documents', createBody());

    expect(res.status).toBe(400);
    // Rejected before any storage or database work happens.
    expect(storage.objectExists).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('POST /documents refuses a key whose object never landed', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    storage.objectExists.mockResolvedValue(false);

    const res = await postJson('/documents', createBody());

    expect(res.status).toBe(400);
    // No row may exist for a file that was never uploaded.
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('POST /documents records the submission as pending', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    dbState.insertResult = [makeDocumentRow()];

    const res = await postJson('/documents', createBody({ expiresOn: '2030-01-31' }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      id: DOC_ID,
      ownerId: 'u_1',
      type: 'permis',
      status: 'pending',
      fileName: 'permis.jpg',
      reviewNote: null,
      reviewedAt: null,
    });
    // The bucket key is API-internal and must never reach a client.
    expect(body).not.toHaveProperty('storageKey');
  });

  it('POST /documents rejects a malformed expiry date', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    const res = await postJson('/documents', createBody({ expiresOn: '31/01/2030' }));
    expect(res.status).toBe(400);
  });

  /* ─────────────────────────── Reading them back ──────────────────────── */

  it('GET /documents/me returns 401 without a session', async () => {
    getSession.mockResolvedValue(null);
    const res = await documentModule.request('/documents/me');
    expect(res.status).toBe(401);
  });

  it("GET /documents/me lists the caller's own submissions", async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    dbState.selectResult = [makeDocumentRow({ status: 'rejected', reviewNote: 'Photo floue' })];

    const res = await documentModule.request('/documents/me');

    expect(res.status).toBe(200);
    const rows = (await res.json()) as { status: string; reviewNote: string }[];
    expect(rows).toHaveLength(1);
    // The driver has to be able to read WHY, or they cannot fix it.
    expect(rows[0]).toMatchObject({ status: 'rejected', reviewNote: 'Photo floue' });
  });

  /* ───────────────────────────── Viewing the file ─────────────────────── */

  it('GET /documents/:id/file returns 404 when the document is unknown', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    dbState.selectResult = [];
    const res = await documentModule.request(`/documents/${DOC_ID}/file`);
    expect(res.status).toBe(404);
  });

  it('GET /documents/:id/file signs a URL for the owner', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    dbState.selectResult = [makeDocumentRow()];

    const res = await documentModule.request(`/documents/${DOC_ID}/file`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { viewUrl: string; expiresInSeconds: number };
    expect(body.viewUrl).toContain('documents/u_1/');
    expect(body.expiresInSeconds).toBe(300);
  });

  it('GET /documents/:id/file forbids another ordinary user', async () => {
    getSession.mockResolvedValue(sessionFor('u_2', 'user'));
    dbState.selectResult = [makeDocumentRow()]; // owned by u_1

    const res = await documentModule.request(`/documents/${DOC_ID}/file`);
    expect(res.status).toBe(403);
  });

  it("GET /documents/:id/file lets an admin read someone else's document", async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    dbState.selectResult = [makeDocumentRow()]; // owned by u_1

    // This is what makes the backoffice able to display what it reviews.
    const res = await documentModule.request(`/documents/${DOC_ID}/file`);
    expect(res.status).toBe(200);
  });

  it('GET /documents/:id/file is not fooled by a role that merely contains "admin"', async () => {
    getSession.mockResolvedValue(sessionFor('u_2', 'subadmin'));
    dbState.selectResult = [makeDocumentRow()]; // owned by u_1

    const res = await documentModule.request(`/documents/${DOC_ID}/file`);
    expect(res.status).toBe(403);
  });
});
