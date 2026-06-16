import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the workspace packages (they ship TS source) into the output so the
  // production image can run plain Node without the pnpm workspace present.
  noExternal: [/^@carpool\//],
});
