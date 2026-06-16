import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';

/**
 * Apply all pending migrations from the ./drizzle folder.
 * Run with: `pnpm --filter @carpool/api db:migrate`.
 */
async function main(): Promise<void> {
  console.log('[db] running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('[db] migrations complete.');
  await pool.end();
}

main().catch((error: unknown) => {
  console.error('[db] migration failed:', error);
  process.exit(1);
});
