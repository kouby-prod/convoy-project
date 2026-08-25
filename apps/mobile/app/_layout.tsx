import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { colors } from '@/lib/theme';

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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session?.user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trajets/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="contact" options={{ headerShown: true, title: 'Contact' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session?.user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
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
