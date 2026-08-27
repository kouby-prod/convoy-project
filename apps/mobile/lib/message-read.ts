import * as SecureStore from 'expo-secure-store';
import type { Conversation } from '@carpool/schemas';

/**
 * Last-read tracking for booking message threads — mobile counterpart of the
 * web's `lib/message-read.ts`. There is no server-side "read" state for
 * messages (unlike notifications), so this mirrors the web's client-only
 * approach: `expo-secure-store` instead of `localStorage` (same idea,
 * per-device instead of per-browser — already used for the auth session, so
 * no new dependency).
 */
export type ReadMap = Record<string, string>;

function storageKey(userId: string) {
  return `message-read-${userId}`;
}

export async function loadReadMap(userId: string): Promise<ReadMap> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as ReadMap;
  } catch {
    return {};
  }
}

/** Mark a booking thread as read at `at` (defaults to now). Returns the updated map. */
export async function markBookingRead(
  userId: string,
  bookingId: string,
  at = new Date().toISOString(),
): Promise<ReadMap> {
  const map = await loadReadMap(userId);
  const previous = map[bookingId];
  if (previous && Date.parse(previous) >= Date.parse(at)) return map;
  const next = { ...map, [bookingId]: at };
  await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(next));
  return next;
}

/** Unread when the last message is from the other party and newer than last open. */
export function isThreadUnread(thread: Conversation, userId: string | undefined, readMap: ReadMap): boolean {
  if (!userId) return false;
  const last = thread.lastMessage;
  if (!last || last.senderId === userId) return false;
  const readAt = readMap[thread.bookingId];
  if (!readAt) return true;
  return Date.parse(last.createdAt) > Date.parse(readAt);
}

export function unreadThreadCount(threads: Conversation[], userId: string | undefined, readMap: ReadMap): number {
  return threads.reduce((count, thread) => count + (isThreadUnread(thread, userId, readMap) ? 1 : 0), 0);
}
