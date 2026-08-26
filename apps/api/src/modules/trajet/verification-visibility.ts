import { and, inArray } from 'drizzle-orm';
import { deriveDriverVerification, REQUIRED_DRIVER_DOCUMENT_TYPES } from '@carpool/schemas';
import { db } from '../../db/client';
import { driverDocument } from '../../db/document';
import { driverEligibility } from '../../db/eligibility';

/**
 * Which of the given driver ids currently roll up to a fully `approved`
 * verification (`permis` + `assurance` + `immatriculation`, all approved and
 * — for `permis` — still within its one-year re-verification window).
 *
 * Drives the "Vérifié"/"Non vérifié" badge on a driver's profile. It does NOT
 * gate whether a ride is publicly listed — an unverified driver's trajets are
 * still shown in search, just badged as unverified — so, unlike an admin
 * queue, this is always scoped to the driver ids the caller already needs
 * (a search results page, or a single ride's driver) rather than scanning
 * every submission on file.
 *
 * Mirrors `loadVerifications` in `../admin/index.ts`: same two tables, same
 * rollup function (`deriveDriverVerification`), so the backoffice queue, the
 * driver's own `/mes-documents` page, and this badge can never disagree about
 * who counts as verified.
 */
export async function getVerifiedDriverIds(driverIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(driverIds)];
  if (unique.length === 0) return new Set();

  const [documentRows, eligibilityRows] = await Promise.all([
    db
      .select({
        ownerId: driverDocument.ownerId,
        type: driverDocument.type,
        status: driverDocument.status,
        submittedAt: driverDocument.submittedAt,
        ageConfirmed: driverDocument.ageConfirmed,
        reviewedAt: driverDocument.reviewedAt,
      })
      .from(driverDocument)
      .where(
        and(
          inArray(driverDocument.ownerId, unique),
          inArray(driverDocument.type, [...REQUIRED_DRIVER_DOCUMENT_TYPES]),
        ),
      ),
    db
      .select({ userId: driverEligibility.userId, dateOfBirth: driverEligibility.dateOfBirth })
      .from(driverEligibility)
      .where(inArray(driverEligibility.userId, unique)),
  ]);

  const documentsByOwner = new Map<string, typeof documentRows>();
  for (const row of documentRows) {
    const bucket = documentsByOwner.get(row.ownerId);
    if (bucket) bucket.push(row);
    else documentsByOwner.set(row.ownerId, [row]);
  }
  const dateOfBirthByOwner = new Map(eligibilityRows.map((row) => [row.userId, row.dateOfBirth]));

  const verified = new Set<string>();
  for (const driverId of unique) {
    const verification = deriveDriverVerification(documentsByOwner.get(driverId) ?? [], {
      dateOfBirth: dateOfBirthByOwner.get(driverId) ?? null,
    });
    if (verification.status === 'approved') verified.add(driverId);
  }
  return verified;
}
