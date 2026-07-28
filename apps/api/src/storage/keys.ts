import { randomUUID } from 'node:crypto';

/**
 * Bucket key rules — pure, and deliberately free of any client or environment.
 *
 * These decide who may claim an upload, so they are separated from `s3.ts` (which
 * needs credentials and a live endpoint) to stay directly testable rather than
 * being reachable only behind a mock.
 */

/**
 * Strip anything that could escape the key namespace or confuse a
 * Content-Disposition header. The original name is kept in the database for
 * display; this is only the storage-safe echo of it.
 *
 * Runs of dots collapse to one. A bucket key is a flat string, so `..` cannot
 * traverse anything here — but the same value is echoed into a filename header,
 * and leaving `..` in it costs nothing to remove and removes the whole question.
 */
export function safeFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '');
  return cleaned.slice(0, 80) || 'document';
}

/**
 * Build the key for a new upload: `documents/<ownerId>/<uuid>-<file>`.
 *
 * The owner id in the path is what makes a key unclaimable. When the driver
 * comes back to register the upload, the API checks this prefix rather than
 * trusting the key it was handed — otherwise one driver could quote another's
 * key and attach someone else's document to their own account.
 */
export function buildStorageKey(ownerId: string, fileName: string): string {
  return `documents/${ownerId}/${randomUUID()}-${safeFileName(fileName)}`;
}

/** Whether a key belongs to this owner's namespace. See `buildStorageKey`. */
export function isKeyOwnedBy(storageKey: string, ownerId: string): boolean {
  return storageKey.startsWith(`documents/${ownerId}/`);
}
