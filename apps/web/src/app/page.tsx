'use client';

import { useQuery } from '@tanstack/react-query';
import { getPing } from '@carpool/api-client';
import { env } from '@/lib/env';

export default function HomePage() {
  // `data` is fully inferred as PingResponse — the contract spine end to end.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['ping'],
    queryFn: () => getPing(env.NEXT_PUBLIC_API_URL),
  });

  return (
    <main style={{ maxWidth: 560 }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Carpool — web</h1>
      <p style={{ color: '#9a9aa2', marginTop: 0 }}>
        Preuve du contrat <code>/ping</code> via TanStack Query + Hono RPC.
      </p>

      <section
        style={{
          marginTop: '1.5rem',
          padding: '1.25rem',
          borderRadius: 12,
          background: '#16161d',
          border: '1px solid #26262f',
        }}
      >
        {isLoading && <p>Chargement…</p>}
        {isError && <p style={{ color: '#ff6b6b' }}>Erreur : {(error as Error).message}</p>}
        {data && (
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem' }}>
            <dt style={{ color: '#9a9aa2' }}>message</dt>
            <dd style={{ margin: 0 }}>{data.message}</dd>
            <dt style={{ color: '#9a9aa2' }}>timestamp</dt>
            <dd style={{ margin: 0 }}>{data.timestamp}</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
