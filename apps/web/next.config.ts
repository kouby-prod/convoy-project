import type { NextConfig } from 'next';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load env from the single root .env. next.config runs before the build, so the
// NEXT_PUBLIC_* values are present in process.env when Next inlines them.
config({ path: resolve(process.cwd(), '../../.env') });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next must transpile them.
  transpilePackages: ['@carpool/api-client', '@carpool/schemas', '@carpool/core'],
};

export default nextConfig;
