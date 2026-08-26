import { DOCUMENT_MAX_BYTES, DocumentMimeTypeSchema, type DocumentMimeType } from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';
import { ApiError } from './api-error';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

export async function fetchAvatarUrl(userId: string): Promise<string | null> {
  const res = await api.avatars[':userId'].$get({ param: { userId } });
  if (res.status === 404) return null;
  // Route declares only 200/404 — after the 404 branch, `res` is the 200 shape.
  const { viewUrl } = await res.json();
  return viewUrl;
}

export async function uploadMyAvatar(file: File): Promise<string> {
  const mimeType = toSupportedMimeType(file);
  if (file.size > DOCUMENT_MAX_BYTES) {
    throw new ApiError(413, 'File exceeds the maximum size');
  }

  const signed = await api.avatars.me['upload-url'].$post({
    json: { fileName: file.name, mimeType, sizeBytes: file.size },
  });
  if (!signed.ok) throw new ApiError(signed.status, 'Failed to prepare the upload');
  const { uploadUrl, storageKey } = await signed.json();

  const uploaded = await fetch(uploadUrl, { method: 'PUT', body: file });
  if (!uploaded.ok) throw new ApiError(uploaded.status, 'Upload failed');

  const confirmed = await api.avatars.me.$put({
    json: { storageKey, fileName: file.name, mimeType, sizeBytes: file.size },
  });
  if (!confirmed.ok) throw new ApiError(confirmed.status, 'Failed to attach the photo');
  const { viewUrl } = await confirmed.json();
  return viewUrl;
}

function toSupportedMimeType(file: File): DocumentMimeType {
  const parsed = DocumentMimeTypeSchema.safeParse(file.type);
  if (!parsed.success || parsed.data === 'application/pdf') {
    throw new ApiError(415, 'Unsupported file type');
  }
  return parsed.data;
}
