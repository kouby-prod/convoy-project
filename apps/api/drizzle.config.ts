import './src/load-env';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration. Generates migrations from `src/db/schema.ts`
 * (currently empty) into the `./drizzle` folder, targeting PostgreSQL via
 * `DATABASE_URL`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
