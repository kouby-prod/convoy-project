import type { DriverEligibility, DriverNameDeclaration } from '@carpool/schemas';
import { api } from './api-client';

/** GET /eligibility — the driver's declared date of birth, licence number and name, with age derived. */
export async function fetchMyEligibility(): Promise<DriverEligibility> {
  const res = await api.eligibility.$get();
  if (!res.ok) throw new Error('Failed to load your eligibility details');
  return res.json();
}

/** PUT /eligibility — declare the date of birth behind the minimum-age rule. */
export async function saveMyEligibility(dateOfBirth: string): Promise<DriverEligibility> {
  const res = await api.eligibility.$put({ json: { dateOfBirth } });
  if (!res.ok) throw new Error('Failed to save your date of birth');
  return res.json();
}

/** PUT /eligibility/license-number — declare the number printed on the driver's licence. */
export async function saveMyLicenseNumber(licenseNumber: string): Promise<DriverEligibility> {
  const res = await api.eligibility['license-number'].$put({ json: { licenseNumber } });
  if (!res.ok) throw new Error('Failed to save your licence number');
  return res.json();
}

/** PUT /eligibility/name — declare the driver's legal first/last name. */
export async function saveMyName(name: DriverNameDeclaration): Promise<DriverEligibility> {
  const res = await api.eligibility.name.$put({ json: name });
  if (!res.ok) throw new Error('Failed to save your name');
  return res.json();
}
