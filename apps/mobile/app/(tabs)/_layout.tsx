import { Tabs } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchUnreadNotificationCount } from '@/lib/notifications';
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
      <Tabs.Screen name="documents" options={{ title: 'Documents' }} />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Alertes', tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tabs.Screen name="compte" options={{ title: 'Compte' }} />
    </Tabs>
  );
}
