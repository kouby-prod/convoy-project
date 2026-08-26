import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { UnreadCount } from '@carpool/schemas';
import { authClient } from '@/lib/auth-client';
import { useNotificationsSocket } from '@/hooks/useNotificationsSocket';
import { colors } from '@/lib/theme';

/**
 * Keeps the `['notifications', 'unread-count']` cache (read by the tab bar
 * badge) fresh for as long as the app is signed in — mounted here rather
 * than on the notifications screen itself so the badge keeps updating while
 * the driver is on any other tab. On each live notification this bumps the
 * cached count and invalidates the notifications list so an open list
 * screen refetches; it does not fetch the initial count itself (the tab bar
 * badge's own query does that).
 */
function NotificationsSync() {
  const queryClient = useQueryClient();

  useNotificationsSocket({
    onNotification: () => {
      queryClient.setQueryData<UnreadCount>(['notifications', 'unread-count'], (current) => ({
        unreadCount: (current?.unreadCount ?? 0) + 1,
      }));
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] });
    },
  });

  return null;
}

/**
 * Auth-gates the whole app in one place via `Stack.Protected`: the guard is
 * driven by the same `useSession()` store `expoClient` updates on sign-in/out,
 * so screens under `(tabs)` never need their own redirect-if-logged-out
 * effect (unlike every "my X" list on the web).
 */
function RootNavigator() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      {session?.user ? <NotificationsSync /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session?.user}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="trajets/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="contact" options={{ headerShown: true, title: 'Contact' }} />
          <Stack.Screen name="vehicle" options={{ headerShown: true, title: 'Mon véhicule' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session?.user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <RootNavigator />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
