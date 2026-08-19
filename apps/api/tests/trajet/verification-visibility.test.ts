import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Hermetic: fake the Drizzle query builder so no real database is needed.
 */
function createChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const dbState = vi.hoisted(() => ({
  documentRows: [] as unknown[],
  eligibilityRows: [] as unknown[],
}));

const db = vi.hoisted(() => ({
  select: vi.fn((selection: Record<string, unknown>) =>
    createChain('ownerId' in selection ? dbState.documentRows : dbState.eligibilityRows),
  ),
}));

vi.mock('../../src/db/client', () => ({ db }));

import { getVerifiedDriverIds } from '../../src/modules/trajet/verification-visibility';

const NOW_ISO = '2026-07-31T12:00:00.000Z';
const ADULT_DOB = '1994-03-12';

// permis is the only required document today — assurance/immatriculation are
// self-certified (see @carpool/schemas document.ts) and no longer count
// towards verification, so they don't appear in these fixtures.
function permisDoc(ownerId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ownerId,
    type: 'permis',
    status: 'approved',
    submittedAt: NOW_ISO,
    ageConfirmed: true,
    reviewedAt: NOW_ISO,
    ...overrides,
  };
}

describe('getVerifiedDriverIds', () => {
  beforeEach(() => {
    dbState.documentRows = [];
    dbState.eligibilityRows = [];
    db.select.mockClear();
  });

  it('returns an empty set for an empty driver id list, without querying the db', async () => {
    await expect(getVerifiedDriverIds([])).resolves.toEqual(new Set());
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns nothing when no documents were ever submitted', async () => {
    await expect(getVerifiedDriverIds(['driver_1'])).resolves.toEqual(new Set());
  });

  it('includes a driver whose permis is approved and declared as adult', async () => {
    dbState.documentRows = [permisDoc('driver_1')];
    dbState.eligibilityRows = [{ userId: 'driver_1', dateOfBirth: ADULT_DOB }];

    await expect(getVerifiedDriverIds(['driver_1'])).resolves.toEqual(new Set(['driver_1']));
  });

  it('excludes a driver whose permis is still pending review', async () => {
    dbState.documentRows = [permisDoc('driver_1', { status: 'pending', reviewedAt: null })];
    dbState.eligibilityRows = [{ userId: 'driver_1', dateOfBirth: ADULT_DOB }];

    await expect(getVerifiedDriverIds(['driver_1'])).resolves.toEqual(new Set());
  });

  it('excludes a driver whose permis was approved more than a year ago', async () => {
    const staleReviewedAt = '2024-01-01T00:00:00.000Z';
    dbState.documentRows = [permisDoc('driver_1', { reviewedAt: staleReviewedAt })];
    dbState.eligibilityRows = [{ userId: 'driver_1', dateOfBirth: ADULT_DOB }];

    await expect(getVerifiedDriverIds(['driver_1'])).resolves.toEqual(new Set());
  });

  it('only returns the drivers who qualify out of several requested candidates', async () => {
    dbState.documentRows = [
      permisDoc('driver_ok'),
      permisDoc('driver_pending', { status: 'pending', reviewedAt: null }),
    ];
    dbState.eligibilityRows = [
      { userId: 'driver_ok', dateOfBirth: ADULT_DOB },
      { userId: 'driver_pending', dateOfBirth: ADULT_DOB },
    ];

    await expect(getVerifiedDriverIds(['driver_ok', 'driver_pending'])).resolves.toEqual(
      new Set(['driver_ok']),
    );
  });
});
