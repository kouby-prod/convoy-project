import type { Conversation } from '@carpool/schemas';

const EVENT = 'convoy:message-read';

function storageKey(userId: string) {
  return `convoy:message-read:${userId}`;
}

type ReadMap = Record<string, string>;

export function loadReadMap(userId: string): ReadMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as ReadMap;
  } catch {
    return {};
  }
}

function saveReadMap(userId: string, map: ReadMap) {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
}

/** Mark a booking thread as read at `at` (defaults to now). */
export function markBookingRead(userId: string, bookingId: string, at = new Date().toISOString()) {
  const map = loadReadMap(userId);
  const previous = map[bookingId];
  if (previous && Date.parse(previous) >= Date.parse(at)) return;
  map[bookingId] = at;
  saveReadMap(userId, map);
}

export function subscribeReadMap(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Unread when the last message is from the other party and newer than last open. */
export function isThreadUnread(
  thread: Conversation,
  userId: string | undefined,
  readMap: ReadMap,
): boolean {
  if (!userId) return false;
  const last = thread.lastMessage;
  if (!last || last.senderId === userId) return false;
  const readAt = readMap[thread.bookingId];
  if (!readAt) return true;
  return Date.parse(last.createdAt) > Date.parse(readAt);
}

export function unreadThreadCount(
  threads: Conversation[],
  userId: string | undefined,
  readMap: ReadMap,
): number {
  return threads.reduce((count, thread) => count + (isThreadUnread(thread, userId, readMap) ? 1 : 0), 0);
}
