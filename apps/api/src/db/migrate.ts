import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import '../load-env';

/**
 * Apply pending SQL in `apps/api/drizzle`. Used from the host (`pnpm db:migrate`)
 * and as the Docker `api-migrate` one-shot before the API starts.
 *
 * Only `DATABASE_URL` is required — this process does not boot the HTTP server
 * or validate the rest of the API env.
 */
function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), 'drizzle'),
    join(here, '..', 'drizzle'),
    join(here, '..', '..', 'drizzle'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'meta', '_journal.json'))) return dir;
  }
  throw new Error(`Drizzle migrations not found. Looked in: ${candidates.join(', ')}`);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const folder = migrationsFolder();
  const pool = new Pool({ connectionString: databaseUrl });
  console.log(`[db] running migrations from ${folder}...`);
  try {
    await migrate(drizzle(pool), { migrationsFolder: folder });
    console.log('[db] migrations complete.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[db] migration failed:', error);
  process.exit(1);
});
