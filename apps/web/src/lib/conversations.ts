import { createApiClient } from '@carpool/api-client';
import { conversationActivityMs, type Conversation } from '@carpool/schemas';
import { env } from '@/lib/env';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/**
 * Inbox rows from `GET /messages/conversations` (booking threads the user
 * can access as passenger or driver, with counterpart + last message).
 */
export async function fetchConversations(): Promise<Conversation[]> {
  const res = await api.messages.conversations.$get({
    query: { page: '1', limit: '100' },
  });
  if (!res.ok) throw new Error('Failed to load conversations');
  const page = await res.json();
  return page.items;
}

/** One person in the inbox — several bookings fold into a trip switcher. */
export type ConversationGroup = {
  key: string;
  counterpart: Conversation['counterpart'];
  role: Conversation['role'];
  threads: Conversation[];
};

/** Group booking threads by counterpart + role, latest activity first. */
export function groupConversations(items: Conversation[]): ConversationGroup[] {
  const buckets = new Map<string, Conversation[]>();
  for (const item of items) {
    const key = `${item.role}:${item.counterpart.id || item.counterpart.name}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const groups: ConversationGroup[] = [];
  for (const [key, threads] of buckets) {
    const sorted = [...threads].sort((a, b) => conversationActivityMs(b) - conversationActivityMs(a));
    const latest = sorted[0];
    if (!latest) continue;
    groups.push({
      key,
      counterpart: latest.counterpart,
      role: latest.role,
      threads: sorted,
    });
  }

  return groups.sort((a, b) => {
    const left = a.threads[0];
    const right = b.threads[0];
    if (!left || !right) return 0;
    return conversationActivityMs(right) - conversationActivityMs(left);
  });
}
