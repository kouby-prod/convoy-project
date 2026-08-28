import { File, UploadTask, UploadType } from 'expo-file-system';
import { DOCUMENT_MAX_BYTES, parseAvatarMimeType, type DocumentMimeType } from '@carpool/schemas';
import { api } from './api-client';

export async function fetchAvatarUrl(userId: string): Promise<string | null> {
  const res = await api.avatars[':userId'].$get({ param: { userId } });
  if (res.status === 404) return null;
  const { viewUrl } = await res.json();
  return viewUrl;
}

export interface AvatarUpload {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

/** Same three-step handshake as a driver document (upload-url → PUT the bytes → confirm), scoped to the avatar. */
export async function uploadMyAvatar(file: AvatarUpload): Promise<string> {
  const mimeType = toSupportedMimeType(file.mimeType);
  if (file.size > DOCUMENT_MAX_BYTES) throw new Error('File exceeds the maximum size');

  const signed = await api.avatars.me['upload-url'].$post({
    json: { fileName: file.name, mimeType, sizeBytes: file.size },
  });
  if (!signed.ok) throw new Error('Failed to prepare the upload');
  const { uploadUrl, storageKey } = await signed.json();

  // No Content-Type header on purpose: the presigned PUT is not signed with
  // one, matching apps/api/src/storage/s3.ts's `createUploadUrl` (same as
  // the document/vehicle-photo upload handshake).
  const uploadTask = new UploadTask(new File(file.uri), uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
  });
  const result = await uploadTask.uploadAsync();
  if (result.status < 200 || result.status >= 300) throw new Error('Upload failed');

  const confirmed = await api.avatars.me.$put({
    json: { storageKey, fileName: file.name, mimeType, sizeBytes: file.size },
  });
  if (!confirmed.ok) throw new Error('Failed to attach the photo');
  const { viewUrl } = await confirmed.json();
  return viewUrl;
}

function toSupportedMimeType(mimeType: string): DocumentMimeType {
  const parsed = parseAvatarMimeType(mimeType);
  if (!parsed) throw new Error('Unsupported file type');
  return parsed;
}
