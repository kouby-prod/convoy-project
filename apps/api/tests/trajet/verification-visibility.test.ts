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

import { getApprovedDriverIds } from '../../src/modules/trajet/verification-visibility';

const NOW_ISO = '2026-07-31T12:00:00.000Z';
const ADULT_DOB = '1994-03-12';

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

function otherDocs(ownerId: string) {
  return [
    { ownerId, type: 'assurance', status: 'approved', submittedAt: NOW_ISO, ageConfirmed: false, reviewedAt: NOW_ISO },
    {
      ownerId,
      type: 'immatriculation',
      status: 'approved',
      submittedAt: NOW_ISO,
      ageConfirmed: false,
      reviewedAt: NOW_ISO,
    },
  ];
}

describe('getApprovedDriverIds', () => {
  beforeEach(() => {
    dbState.documentRows = [];
    dbState.eligibilityRows = [];
    db.select.mockClear();
  });

  it('returns nothing when no documents were ever submitted', async () => {
    await expect(getApprovedDriverIds()).resolves.toEqual([]);
  });

  it('includes a driver whose three documents are all approved and declared as adult', async () => {
    dbState.documentRows = [permisDoc('driver_1'), ...otherDocs('driver_1')];
    dbState.eligibilityRows = [{ userId: 'driver_1', dateOfBirth: ADULT_DOB }];

    await expect(getApprovedDriverIds()).resolves.toEqual(['driver_1']);
  });

  it('excludes a driver still missing a document', async () => {
    dbState.documentRows = [permisDoc('driver_1')];
    dbState.eligibilityRows = [{ userId: 'driver_1', dateOfBirth: ADULT_DOB }];

    await expect(getApprovedDriverIds()).resolves.toEqual([]);
  });

  it('excludes a driver whose permis was approved more than a year ago', async () => {
    const staleReviewedAt = '2024-01-01T00:00:00.000Z';
    dbState.documentRows = [permisDoc('driver_1', { reviewedAt: staleReviewedAt }), ...otherDocs('driver_1')];
    dbState.eligibilityRows = [{ userId: 'driver_1', dateOfBirth: ADULT_DOB }];

    await expect(getApprovedDriverIds()).resolves.toEqual([]);
  });

  it('only returns the drivers who qualify out of several candidates', async () => {
    dbState.documentRows = [
      permisDoc('driver_ok'),
      ...otherDocs('driver_ok'),
      permisDoc('driver_incomplete'),
    ];
    dbState.eligibilityRows = [
      { userId: 'driver_ok', dateOfBirth: ADULT_DOB },
      { userId: 'driver_incomplete', dateOfBirth: ADULT_DOB },
    ];

    await expect(getApprovedDriverIds()).resolves.toEqual(['driver_ok']);
  });
});
