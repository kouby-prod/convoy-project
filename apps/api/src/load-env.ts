import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Load environment from the SINGLE root `.env`.
 *
 * This file lives at `apps/api/src/`, and the compiled bundle lives at
 * `apps/api/dist/` — both are exactly three levels under the repo root, so the
 * same `../../../.env` resolves correctly in dev (tsx) and prod (bundle),
 * regardless of the current working directory.
 *
 * In Docker there is no file at that path; that's fine — the variables are
 * injected by docker compose and dotenv never overrides already-set vars.
 */
const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env');
config({ path: rootEnv });
