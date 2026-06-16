import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next must transpile them.
  transpilePackages: ['@carpool/api-client', '@carpool/schemas', '@carpool/core'],
};

export default nextConfig;
