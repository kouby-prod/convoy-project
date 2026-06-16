import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getPing } from '@carpool/api-client';
import { env } from '@/lib/env';

export default function HomeScreen() {
  // `data` is fully inferred as PingResponse — same contract spine as the web app.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['ping'],
    queryFn: () => getPing(env.EXPO_PUBLIC_API_URL),
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Carpool — mobile</Text>
        <Text style={styles.subtitle}>Preuve du contrat /ping (TanStack Query + Hono RPC)</Text>

        <View style={styles.card}>
          {isLoading && <ActivityIndicator color="#f5f5f7" />}
          {isError && <Text style={styles.error}>Erreur : {(error as Error).message}</Text>}
          {data && (
            <View style={styles.rows}>
              <Text style={styles.label}>message</Text>
              <Text style={styles.value}>{data.message}</Text>
              <Text style={styles.label}>timestamp</Text>
              <Text style={styles.value}>{data.timestamp}</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0f' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { color: '#f5f5f7', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#9a9aa2', marginTop: 4, marginBottom: 24 },
  card: {
    backgroundColor: '#16161d',
    borderColor: '#26262f',
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
  },
  rows: { gap: 6 },
  label: { color: '#9a9aa2', fontSize: 12 },
  value: { color: '#f5f5f7', fontSize: 16, marginBottom: 8 },
  error: { color: '#ff6b6b' },
});
