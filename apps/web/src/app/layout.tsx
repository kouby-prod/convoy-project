import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Carpool — web',
  description: 'Base skeleton: /ping proof',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
          padding: '2rem',
          background: '#0b0b0f',
          color: '#f5f5f7',
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
