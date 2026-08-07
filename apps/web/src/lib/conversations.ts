import { createApiClient } from '@carpool/api-client';
import type { Conversation } from '@carpool/schemas';
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
