import { describe, expect, it } from 'vitest';
import {
  MIN_DRIVER_AGE,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  ageOn,
  deriveDriverVerification,
  isOldEnoughToDrive,
  type VerifiableDocument,
} from '@carpool/schemas';

/**
 * The eligibility rollup from @carpool/schemas.
 *
 * Exercised here because it is the one piece of contract logic both sides
 * *compute* rather than merely read: the driver's banner and the backoffice chip
 * must never disagree about whether someone may drive.
 *
 * The four conditions under test are:
 *   1. a valid Canadian driver's licence   → `permis`
 *   2. valid auto insurance                → `assurance`
 *   3. a compliant, roadworthy vehicle     → `immatriculation`
 *   4. at least 18 years old               → declared birth date + reviewer confirmation
 */

const EARLIER = '2026-01-01T10:00:00.000Z';
const LATER = '2026-06-01T10:00:00.000Z';

/** Fixed "now" so ages in these tests never drift as the calendar moves. */
const NOW = new Date('2026-07-31T12:00:00.000Z');
const ADULT = '1994-03-12'; // 32 on NOW
const TURNS_18_TOMORROW = '2008-08-01';
const TURNED_18_TODAY = '2008-07-31';

function doc(
  type: string,
  status: string,
  extra: Partial<VerifiableDocument> = {},
): VerifiableDocument {
  return { type, status, submittedAt: EARLIER, ...extra };
}

/** All three documents approved, with the licence's age confirmation settled. */
function allApproved(): VerifiableDocument[] {
  return REQUIRED_DRIVER_DOCUMENT_TYPES.map((type) =>
    doc(type, 'approved', type === 'permis' ? { ageConfirmed: true } : {}),
  );
}

const adult = { dateOfBirth: ADULT };

describe('age helpers', () => {
  it('counts completed years, not elapsed milliseconds', () => {
    expect(ageOn(ADULT, NOW)).toBe(32);
  });

  it('does not round someone up on the day before their birthday', () => {
    // The whole reason this is a (month, day) comparison: dividing elapsed time
    // by 365.25 turns the eve of an 18th birthday into 18.
    expect(ageOn(TURNS_18_TOMORROW, NOW)).toBe(17);
    expect(isOldEnoughToDrive(TURNS_18_TOMORROW, NOW)).toBe(false);
  });

  it('counts someone as eligible ON their 18th birthday', () => {
    expect(ageOn(TURNED_18_TODAY, NOW)).toBe(MIN_DRIVER_AGE);
    expect(isOldEnoughToDrive(TURNED_18_TODAY, NOW)).toBe(true);
  });

  it('treats an undeclared birth date as not eligible rather than as a pass', () => {
    expect(isOldEnoughToDrive(null, NOW)).toBe(false);
  });
});

describe('deriveDriverVerification', () => {
  it('asks for exactly the three documentary conditions', () => {
    expect(REQUIRED_DRIVER_DOCUMENT_TYPES).toEqual(['permis', 'assurance', 'immatriculation']);
    expect(deriveDriverVerification([], {}, NOW).requiredCount).toBe(3);
  });

  it('reports a driver with nothing on file as incomplete', () => {
    const verification = deriveDriverVerification([], {}, NOW);

    expect(verification.status).toBe('incomplete');
    expect(verification.approvedCount).toBe(0);
    // Every required type still gets a slot, so the UI can render all three cards.
    expect(verification.slots).toEqual([
      { type: 'permis', status: 'missing' },
      { type: 'assurance', status: 'missing' },
      { type: 'immatriculation', status: 'missing' },
    ]);
    expect(verification.age).toEqual({
      dateOfBirth: null,
      age: null,
      isAdult: false,
      confirmedByReviewer: false,
    });
  });

  it('stays incomplete while only some documents are in', () => {
    const verification = deriveDriverVerification([doc('permis', 'approved')], adult, NOW);

    expect(verification.status).toBe('incomplete');
    expect(verification.approvedCount).toBe(1);
  });

  it('is pending once all three are sent and awaiting a decision', () => {
    const verification = deriveDriverVerification(
      [doc('permis', 'pending'), doc('assurance', 'approved'), doc('immatriculation', 'pending')],
      adult,
      NOW,
    );

    expect(verification.status).toBe('pending');
  });

  it('is approved when all three are approved and the age is settled', () => {
    const verification = deriveDriverVerification(allApproved(), adult, NOW);

    expect(verification.status).toBe('approved');
    expect(verification.approvedCount).toBe(3);
    expect(verification.age).toMatchObject({ age: 32, isAdult: true, confirmedByReviewer: true });
  });

  /* ── The fourth condition is not optional ──────────────────────────────── */

  it('is NOT approved when every document passes but no birth date was declared', () => {
    const verification = deriveDriverVerification(allApproved(), {}, NOW);

    expect(verification.status).not.toBe('approved');
    expect(verification.status).toBe('incomplete');
  });

  it('is NOT approved when the driver is under the minimum age', () => {
    const verification = deriveDriverVerification(
      allApproved(),
      { dateOfBirth: TURNS_18_TOMORROW },
      NOW,
    );

    expect(verification.age.isAdult).toBe(false);
    expect(verification.status).not.toBe('approved');
  });

  it('is NOT approved when no reviewer confirmed the birth date on the licence', () => {
    // A declaration nobody checked is a claim, not a verification.
    const documents = allApproved().map((entry) =>
      entry.type === 'permis' ? { ...entry, ageConfirmed: false } : entry,
    );

    const verification = deriveDriverVerification(documents, adult, NOW);

    expect(verification.age.confirmedByReviewer).toBe(false);
    expect(verification.status).toBe('pending');
  });

  it('ignores an age confirmation carried by a licence that is not approved', () => {
    const verification = deriveDriverVerification(
      [doc('permis', 'pending', { ageConfirmed: true })],
      adult,
      NOW,
    );

    expect(verification.age.confirmedByReviewer).toBe(false);
  });

  /* ── Refusals and history ──────────────────────────────────────────────── */

  it('surfaces a rejection ahead of a document that is merely missing', () => {
    // Both need action, but only the refusal carries a reason the driver can
    // act on, so it is the one the banner leads with.
    const verification = deriveDriverVerification([doc('assurance', 'rejected')], adult, NOW);

    expect(verification.status).toBe('rejected');
  });

  it('counts only the newest submission of a type', () => {
    // Re-sending a refused document inserts a new row rather than overwriting
    // the old one; the rollup has to move on while the history keeps both.
    const verification = deriveDriverVerification(
      [
        doc('assurance', 'rejected', { submittedAt: EARLIER }),
        doc('assurance', 'approved', { submittedAt: LATER }),
        doc('permis', 'approved', { ageConfirmed: true }),
        doc('immatriculation', 'approved'),
      ],
      adult,
      NOW,
    );

    expect(verification.status).toBe('approved');
  });

  it('reads Date and ISO-string timestamps the same way', () => {
    // Raw database rows carry Date, serialized documents carry ISO strings, and
    // both reach this helper.
    const verification = deriveDriverVerification(
      [
        doc('permis', 'rejected', { submittedAt: EARLIER }),
        doc('permis', 'approved', { submittedAt: new Date(LATER), ageConfirmed: true }),
        doc('assurance', 'approved', { submittedAt: new Date(LATER) }),
        doc('immatriculation', 'approved', { submittedAt: new Date(LATER) }),
      ],
      adult,
      NOW,
    );

    expect(verification.status).toBe('approved');
  });

  it('ignores documents outside the required set', () => {
    // Legacy types are renderable but must not count towards eligibility.
    const verification = deriveDriverVerification(
      [
        doc('carteIdentite', 'approved'),
        doc('carteGrise', 'approved'),
        doc('permis', 'approved', { ageConfirmed: true }),
      ],
      adult,
      NOW,
    );

    expect(verification.status).toBe('incomplete');
    expect(verification.approvedCount).toBe(1);
  });

  it('treats an unrecognised status as missing rather than as a pass', () => {
    const verification = deriveDriverVerification(
      [doc('permis', 'definitely-fine'), doc('assurance', 'approved')],
      adult,
      NOW,
    );

    expect(verification.slots[0]).toEqual({ type: 'permis', status: 'missing' });
    expect(verification.status).toBe('incomplete');
  });
});
