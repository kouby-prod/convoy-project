import { inArray } from 'drizzle-orm';
import { deriveDriverVerification, REQUIRED_DRIVER_DOCUMENT_TYPES } from '@carpool/schemas';
import { db } from '../../db/client';
import { driverDocument } from '../../db/document';
import { driverEligibility } from '../../db/eligibility';

/**
 * Every driver whose verification (`permis` + `assurance` + `immatriculation`,
 * all approved and — for `permis` — still within its one-year re-verification
 * window) currently rolls up to `approved`. Used to keep an unverified, or
 * no-longer-fresh, driver's rides out of *public* search: the ride itself is
 * created regardless (see `createTrajetRoute`) and stays visible to its own
 * driver on `/me/trajets`, but a rider searching publicly should not land on
 * a driver who isn't cleared to drive.
 *
 * Mirrors `loadVerifications` in `../admin/index.ts`: same two tables, same
 * rollup function (`deriveDriverVerification`), so the backoffice queue, the
 * driver's own `/mes-documents` page, and public search can never disagree
 * about who counts as verified.
 *
 * Scans every submitted document/declaration rather than scoping to drivers
 * with an active trajet — simpler and, at this project's scale, cheap; worth
 * revisiting (scope to candidate driver ids passed by the caller) if the
 * driver base grows large enough for that full scan to matter.
 */
export async function getApprovedDriverIds(): Promise<string[]> {
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
      .where(inArray(driverDocument.type, [...REQUIRED_DRIVER_DOCUMENT_TYPES])),
    db.select({ userId: driverEligibility.userId, dateOfBirth: driverEligibility.dateOfBirth }).from(driverEligibility),
  ]);

  const documentsByOwner = new Map<string, typeof documentRows>();
  for (const row of documentRows) {
    const bucket = documentsByOwner.get(row.ownerId);
    if (bucket) bucket.push(row);
    else documentsByOwner.set(row.ownerId, [row]);
  }
  const dateOfBirthByOwner = new Map(eligibilityRows.map((row) => [row.userId, row.dateOfBirth]));

  return [...documentsByOwner.keys()].filter((driverId) => {
    const verification = deriveDriverVerification(documentsByOwner.get(driverId) ?? [], {
      dateOfBirth: dateOfBirthByOwner.get(driverId) ?? null,
    });
    return verification.status === 'approved';
  });
}
