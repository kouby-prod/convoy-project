import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env';
import { safeFileName } from './keys';

/**
 * Object storage seam — the only module that knows the bucket exists.
 *
 * The API never carries document bytes. It signs short-lived URLs and the
 * browser transfers the file directly to/from MinIO, which keeps identity
 * documents off the API process entirely.
 *
 * Two clients, because a presigned URL is signed FOR a host:
 *
 *   internalClient — makes real calls (head/create/delete). Points at the
 *                    endpoint this process can reach: `minio:9000` in Docker.
 *   signingClient  — never makes a call; `getSignedUrl` is pure computation.
 *                    Points at the PUBLIC endpoint, because the browser is what
 *                    follows the link and cannot resolve a compose service name.
 *
 * On the host both endpoints are the same value and the split costs nothing.
 */

const credentials = {
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
};

// `forcePathStyle` — MinIO serves buckets as a path (`/bucket/key`), not as a
// virtual host (`bucket.host`), which is what the SDK would default to.
const internalClient = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials,
});

const signingClient = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_PUBLIC_ENDPOINT,
  forcePathStyle: true,
  credentials,
});

const BUCKET = env.S3_BUCKET;

/** Seconds a signed upload/view URL stays valid. */
export const URL_TTL_SECONDS = env.S3_URL_TTL;

/**
 * Sign a PUT the browser can upload to.
 *
 * `ContentType` is deliberately NOT part of the command: including it would put
 * `content-type` in `SignedHeaders`, and the browser sets that header itself
 * from the File object — any mismatch would fail the signature check. The
 * declared MIME type is validated and stored server-side instead.
 */
export async function createUploadUrl(storageKey: string): Promise<string> {
  return getSignedUrl(
    signingClient,
    new PutObjectCommand({ Bucket: BUCKET, Key: storageKey }),
    { expiresIn: URL_TTL_SECONDS },
  );
}

/**
 * Sign a GET for viewing one document. The response headers are overridden so
 * the browser renders the file in place instead of downloading it — a reviewer
 * should see the ID card, not a file in their Downloads folder.
 */
export async function createViewUrl(
  storageKey: string,
  { fileName, mimeType }: { fileName: string; mimeType: string },
): Promise<string> {
  return getSignedUrl(
    signingClient,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      ResponseContentType: mimeType,
      ResponseContentDisposition: `inline; filename="${safeFileName(fileName)}"`,
    }),
    { expiresIn: URL_TTL_SECONDS },
  );
}

/**
 * Whether the object actually landed in the bucket.
 *
 * Used before recording a submission: the upload happens browser-to-bucket, so
 * without this check a failed or skipped PUT would still create a row pointing
 * at nothing, and the reviewer would open an empty document.
 */
export async function objectExists(storageKey: string): Promise<boolean> {
  try {
    await internalClient.send(new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey }));
    return true;
  } catch {
    // The SDK throws NotFound/NoSuchKey (and 403 on a bucket policy miss).
    // Either way the object is not usable, which is all the caller asked.
    return false;
  }
}

/** Remove an object. Used when a row could not be written after the upload. */
export async function deleteObject(storageKey: string): Promise<void> {
  await internalClient.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey }));
}

/**
 * Create the bucket if it is missing. Called once at boot so a fresh `docker
 * compose up` (empty MinIO volume) is immediately usable, with no manual step
 * in the console.
 */
export async function ensureBucket(): Promise<void> {
  try {
    await internalClient.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return;
  } catch {
    // Missing (or not visible yet) — fall through and try to create it.
  }

  try {
    await internalClient.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`[storage] created bucket "${BUCKET}"`);
  } catch (error: unknown) {
    // A parallel boot may have won the race; that is success, not failure.
    const name = error instanceof Error ? error.name : '';
    if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') return;
    throw error;
  }
}
