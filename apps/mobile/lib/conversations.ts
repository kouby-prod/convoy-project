import type { Conversation } from '@carpool/schemas';
import { api } from './api-client';

/** Inbox rows from `GET /messages/conversations` — booking threads the caller can access as passenger or driver, with counterpart + last message. */
export async function fetchConversations(): Promise<Conversation[]> {
  const res = await api.messages.conversations.$get({ query: { page: '1', limit: '100' } });
  if (!res.ok) throw new Error('Failed to load conversations');
  const page = await res.json();
  return page.items;
}

function activityMs(item: Conversation): number {
  const stamp = item.lastMessage?.createdAt ?? item.trip.departureAt;
  const parsed = Date.parse(stamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Newest activity first — one row per booking thread (no counterpart grouping on mobile, kept simple). */
export function sortConversations(items: Conversation[]): Conversation[] {
  return [...items].sort((a, b) => activityMs(b) - activityMs(a));
}
