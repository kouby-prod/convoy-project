/**
 * Placeholder pure function to prove the test runner works.
 * Pure TypeScript only — no React, DB or HTTP. Domain logic will live here.
 *
 * @param date - a Date to format
 * @returns the ISO-8601 string representation of the date
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString();
}
