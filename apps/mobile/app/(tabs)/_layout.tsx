import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchUnreadNotificationCount } from '@/lib/notifications';
import { fetchConversations } from '@/lib/conversations';
import { unreadThreadCount } from '@/lib/message-read';
import { useMessageReadMap } from '@/hooks/useMessageReadMap';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  // Seeded once here and kept fresh by the root layout's notifications socket
  // (see app/_layout.tsx) — this query only reads the shared cache, it does
  // not poll on its own.
  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadNotificationCount,
    staleTime: Infinity,
  });
  const unreadCount = data?.unreadCount ?? 0;

  // Messages have no server-side read state (see lib/message-read.ts), so
  // this badge is derived client-side from the inbox + the local read map —
  // a light refetch (30s staleTime) is enough since there's no socket
  // pushing new-conversation events at this level.
  const { userId, readMap } = useMessageReadMap();
  const { data: conversations } = useQuery({
    queryKey: ['messages', 'inbox'],
    queryFn: fetchConversations,
    staleTime: 30_000,
  });
  const unreadMessages = unreadThreadCount(conversations ?? [], userId, readMap);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="recherche" options={{ title: 'Recherche' }} />
      <Tabs.Screen name="annoncer" options={{ title: 'Publier' }} />
      <Tabs.Screen name="mes-trajets" options={{ title: 'Mes trajets' }} />
      <Tabs.Screen name="mes-reservations" options={{ title: 'Réservations' }} />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined }}
      />
      <Tabs.Screen name="documents" options={{ title: 'Documents' }} />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Alertes', tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tabs.Screen name="compte" options={{ title: 'Compte' }} />
    </Tabs>
  );
}
