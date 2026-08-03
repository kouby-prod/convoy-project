import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hermetic: fake the Drizzle query builder so no real database is needed.
 * Each chain method returns `this`; the chain is also "thenable" so `await`
 * resolves at whatever point the code stops chaining.
 */
function createChain(result: unknown, onSet?: (values: unknown) => void) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    groupBy: () => chain,
    orderBy: () => chain,
    where: () => chain,
    values: () => chain,
    // Captured, so a test can assert what was actually WRITTEN rather than only
    // what the (mocked) re-read hands back.
    set: (values: unknown) => {
      onSet?.(values);
      return chain;
    },
    returning: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

/**
 * `selectQueue` is consumed one entry per `db.select()` call, because
 * GET /admin/stats deliberately runs three separate aggregates — counting
 * documents and accounts over a single join would multiply the account rows.
 * Queuing makes each test state that sequence explicitly.
 */
const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  updateResult: [] as unknown[],
  /** Values passed to `.set()` on the update chain, in call order. */
  setCalls: [] as Record<string, unknown>[],
}));

const db = vi.hoisted(() => ({
  select: vi.fn(() => createChain(dbState.selectQueue.shift() ?? [])),
  insert: vi.fn(() => createChain([])),
  update: vi.fn(() =>
    createChain(dbState.updateResult, (values) => {
      dbState.setCalls.push(values as Record<string, unknown>);
    }),
  ),
}));

vi.mock('../../src/db/client', () => ({ db }));

// Mock BetterAuth so protected routes can be exercised without real sessions.
const getSession = vi.fn();
vi.mock('../../src/auth/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

import { adminModule } from '../../src/modules/admin';

function sessionFor(id: string, role: string | null) {
  return {
    user: {
      id,
      email: `${id}@example.com`,
      name: 'Root Admin',
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

function makeUserRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'u_1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    emailVerified: true,
    role: 'user',
    phoneNumber: '+33600000000',
    createdAt: now,
    ...overrides,
  };
}

/** Queue reads select `{ document, owner }` through an innerJoin. */
function makeJoinedRow(
  documentOverrides: Partial<Record<string, unknown>> = {},
  ownerOverrides: Partial<Record<string, unknown>> = {},
) {
  return {
    document: makeDocumentRow(documentOverrides),
    owner: makeUserRow(ownerOverrides),
  };
}

function patchJson(path: string, body: unknown) {
  return adminModule.request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('admin module', () => {
  beforeEach(() => {
    db.select.mockClear();
    db.update.mockClear();
    getSession.mockReset();
    dbState.selectQueue = [];
    dbState.updateResult = [];
    dbState.setCalls = [];
  });

  /* ──────────────────────────── The role gate ─────────────────────────── */

  it.each([
    ['/admin/stats'],
    ['/admin/documents'],
    ['/admin/users'],
  ])('GET %s returns 401 without a session', async (path) => {
    getSession.mockResolvedValue(null);
    const res = await adminModule.request(path);
    expect(res.status).toBe(401);
  });

  it.each([
    ['/admin/stats'],
    ['/admin/documents'],
    ['/admin/users'],
  ])('GET %s returns 403 for a signed-in non-admin', async (path) => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    const res = await adminModule.request(path);
    expect(res.status).toBe(403);
  });

  it('rejects a role that merely contains the word "admin"', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'subadmin'));
    const res = await adminModule.request('/admin/documents');
    expect(res.status).toBe(403);
  });

  it('accepts an admin listed among several comma-separated roles', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user,admin'));
    dbState.selectQueue = [[]];
    const res = await adminModule.request('/admin/documents');
    expect(res.status).toBe(200);
  });

  /* ─────────────────────────── The review queue ───────────────────────── */

  it('GET /admin/documents returns each submission with its submitter', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    dbState.selectQueue = [[makeJoinedRow()]];

    const res = await adminModule.request('/admin/documents');

    expect(res.status).toBe(200);
    const rows = (await res.json()) as { owner: Record<string, unknown>; status: string }[];
    expect(rows[0]).toMatchObject({ status: 'pending', type: 'permis' });
    // Knowing WHO submitted it is the whole point of the queue.
    expect(rows[0]?.owner).toMatchObject({
      id: 'u_1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    // The bucket key stays server-side even for an admin.
    expect(rows[0]).not.toHaveProperty('storageKey');
  });

  it("GET /admin/documents reports the submitter's progress across BOTH required documents", async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    // Two selects: the queue join, then the per-owner verification read. The
    // second deliberately looks past the current filter — this driver's ID card
    // was refused, and approving their licence must not read as "done".
    // Documents and eligibility declarations are read in parallel; the mock
    // shifts one queue entry per `db.select()`, in call order.
    dbState.selectQueue = [
      [makeJoinedRow()],
      [
        { ownerId: 'u_1', type: 'permis', status: 'pending', submittedAt: now },
        { ownerId: 'u_1', type: 'assurance', status: 'rejected', submittedAt: now },
      ],
      [{ userId: 'u_1', dateOfBirth: '1994-03-12' }],
    ];

    const res = await adminModule.request('/admin/documents?status=pending');

    expect(res.status).toBe(200);
    const rows = (await res.json()) as { owner: { verification: Record<string, unknown> } }[];
    expect(rows[0]?.owner.verification).toMatchObject({
      status: 'rejected',
      approvedCount: 0,
      requiredCount: 3,
      slots: [
        { type: 'permis', status: 'pending' },
        { type: 'assurance', status: 'rejected' },
        { type: 'immatriculation', status: 'missing' },
      ],
    });
  });

  it('GET /admin/documents carries the declared birth date so a reviewer can check it', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    dbState.selectQueue = [
      [makeJoinedRow()],
      [],
      [{ userId: 'u_1', dateOfBirth: '1994-03-12' }],
    ];

    const res = await adminModule.request('/admin/documents');

    const rows = (await res.json()) as {
      owner: { verification: { age: Record<string, unknown> } };
    }[];
    expect(rows[0]?.owner.verification.age).toMatchObject({
      dateOfBirth: '1994-03-12',
      isAdult: true,
      // Nothing is approved, so nobody has confirmed it yet.
      confirmedByReviewer: false,
    });
  });

  it('GET /admin/documents reports a submitter with nothing else on file as incomplete', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    dbState.selectQueue = [[makeJoinedRow()], []];

    const res = await adminModule.request('/admin/documents');

    const rows = (await res.json()) as { owner: { verification: { status: string } } }[];
    expect(rows[0]?.owner.verification.status).toBe('incomplete');
  });

  it('GET /admin/documents accepts the status and type filters', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    dbState.selectQueue = [[]];

    const res = await adminModule.request('/admin/documents?status=pending&type=permis&q=ada');
    expect(res.status).toBe(200);
    expect(db.select).toHaveBeenCalled();
  });

  it('GET /admin/documents rejects a status outside the enum', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    const res = await adminModule.request('/admin/documents?status=maybe');
    expect(res.status).toBe(400);
  });

  /* ───────────────────────────── The decision ─────────────────────────── */

  it('PATCH /admin/documents/:id returns 403 for a non-admin', async () => {
    getSession.mockResolvedValue(sessionFor('u_1', 'user'));
    const res = await patchJson(`/admin/documents/${DOC_ID}`, { status: 'approved' });
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  /* ── The minimum-age rule rides on the licence approval ────────────────── */

  it('PATCH /admin/documents/:id refuses to approve a LICENCE without confirming the birth date', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    dbState.selectQueue = [[makeDocumentRow({ type: 'permis' })]];

    const res = await patchJson(`/admin/documents/${DOC_ID}`, { status: 'approved' });

    // Otherwise "at least 18 years old" would be a claim nobody ever checked:
    // the licence is the only document that shows a birth date.
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('PATCH /admin/documents/:id approves a licence once the birth date is confirmed', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    const approved = makeDocumentRow({ type: 'permis', status: 'approved', ageConfirmed: true });
    dbState.updateResult = [approved];
    dbState.selectQueue = [
      [makeDocumentRow({ type: 'permis' })],
      [{ document: approved, owner: makeUserRow() }],
      [],
      [],
    ];

    const res = await patchJson(`/admin/documents/${DOC_ID}`, {
      status: 'approved',
      ageConfirmed: true,
    });

    expect(res.status).toBe(200);
    expect(dbState.setCalls.at(-1)).toMatchObject({ status: 'approved', ageConfirmed: true });
  });

  it('PATCH /admin/documents/:id never stores an age confirmation on a non-licence', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    const approved = makeDocumentRow({ type: 'assurance', status: 'approved' });
    dbState.updateResult = [approved];
    dbState.selectQueue = [
      [makeDocumentRow({ type: 'assurance' })],
      [{ document: approved, owner: makeUserRow() }],
      [],
      [],
    ];

    // An insurance certificate shows no birth date, so a confirmation sent
    // against one is meaningless and must not be recorded as a check.
    const res = await patchJson(`/admin/documents/${DOC_ID}`, {
      status: 'approved',
      ageConfirmed: true,
    });

    expect(res.status).toBe(200);
    expect(dbState.setCalls.at(-1)).toMatchObject({ ageConfirmed: false });
  });

  it('PATCH /admin/documents/:id clears the age confirmation when a licence is refused', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    const rejected = makeDocumentRow({ type: 'permis', status: 'rejected' });
    dbState.updateResult = [rejected];
    dbState.selectQueue = [
      [makeDocumentRow({ type: 'permis', ageConfirmed: true })],
      [{ document: rejected, owner: makeUserRow() }],
      [],
      [],
    ];

    const res = await patchJson(`/admin/documents/${DOC_ID}`, {
      status: 'rejected',
      note: 'Document expiré',
    });

    expect(res.status).toBe(200);
    expect(dbState.setCalls.at(-1)).toMatchObject({ ageConfirmed: false });
  });

  it('PATCH /admin/documents/:id refuses a rejection with no reason', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));

    const res = await patchJson(`/admin/documents/${DOC_ID}`, { status: 'rejected' });

    // The rule lives in ReviewDocumentSchema, so it fails before the handler:
    // a driver told only "rejected" has no way back.
    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('PATCH /admin/documents/:id refuses a rejection whose reason is blank', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    const res = await patchJson(`/admin/documents/${DOC_ID}`, { status: 'rejected', note: '   ' });
    expect(res.status).toBe(400);
  });

  it('PATCH /admin/documents/:id records a rejection with its reason', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    const rejected = makeDocumentRow({
      status: 'rejected',
      reviewNote: 'Photo floue',
      reviewedBy: 'admin_1',
      reviewedAt: now,
    });
    dbState.updateResult = [rejected];
    // Three selects now: the read-before-write that decides whether the age
    // confirmation is required, the joined re-read, then the verification rollup.
    dbState.selectQueue = [
      [makeDocumentRow()],
      [{ document: rejected, owner: makeUserRow() }],
      [],
    ];

    const res = await patchJson(`/admin/documents/${DOC_ID}`, {
      status: 'rejected',
      note: 'Photo floue',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'rejected',
      reviewNote: 'Photo floue',
      reviewedBy: 'admin_1',
    });
  });

  it('PATCH /admin/documents/:id clears an earlier reason when approving', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    const approved = makeDocumentRow({
      status: 'approved',
      reviewNote: null,
      reviewedBy: 'admin_1',
      reviewedAt: now,
    });
    dbState.updateResult = [approved];
    dbState.selectQueue = [
      // An `assurance`, so this approval needs no age confirmation — that rule
      // has its own tests below.
      [makeDocumentRow({ type: 'assurance' })],
      [{ document: approved, owner: makeUserRow() }],
      [],
    ];

    const res = await patchJson(`/admin/documents/${DOC_ID}`, {
      status: 'approved',
      // A stale complaint sent along with an approval must not be persisted.
      note: 'Photo floue',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'approved', reviewNote: null });
    // Asserted on the WRITE, not the echo: the note must be nulled in the row.
    expect(dbState.setCalls[0]).toMatchObject({
      status: 'approved',
      reviewNote: null,
      reviewedBy: 'admin_1',
    });
  });

  it('PATCH /admin/documents/:id returns 404 when the submission is unknown', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    dbState.updateResult = [];

    const res = await patchJson(`/admin/documents/${DOC_ID}`, { status: 'approved' });
    expect(res.status).toBe(404);
  });

  /* ─────────────────────────────── Dashboard ──────────────────────────── */

  it('GET /admin/stats aggregates documents and accounts', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    // Three queries, in the order the handler runs them.
    dbState.selectQueue = [
      [{ total: 7, pending: 3, approved: 3, rejected: 1 }],
      [{ total: 5, admins: 1 }],
      [{ value: 2 }],
    ];

    const res = await adminModule.request('/admin/stats');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      documents: { total: 7, pending: 3, approved: 3, rejected: 1 },
      users: { total: 5, admins: 1, awaitingReview: 2 },
    });
  });

  it('GET /admin/stats reports zeroes on an empty database', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    // No aggregate rows at all — the handler must not emit nulls into the contract.
    dbState.selectQueue = [[], [], []];

    const res = await adminModule.request('/admin/stats');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      documents: { total: 0, pending: 0, approved: 0, rejected: 0 },
      users: { total: 0, admins: 0, awaitingReview: 0 },
    });
  });

  /* ─────────────────────────────── Accounts ───────────────────────────── */

  it('GET /admin/users returns accounts with their document tallies', async () => {
    getSession.mockResolvedValue(sessionFor('admin_1', 'admin'));
    dbState.selectQueue = [
      [{ ...makeUserRow(), documentCount: 3, pendingCount: 1, approvedCount: 2 }],
    ];

    const res = await adminModule.request('/admin/users');

    expect(res.status).toBe(200);
    const rows = (await res.json()) as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({
      id: 'u_1',
      email: 'ada@example.com',
      documentCount: 3,
      pendingCount: 1,
      approvedCount: 2,
    });
    // createdAt crosses the wire as an ISO string, not a Date.
    expect(typeof rows[0]?.createdAt).toBe('string');
  });
});
