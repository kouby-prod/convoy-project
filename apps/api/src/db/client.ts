import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';
import * as schema from './schema';

/**
 * PostgreSQL connection pool, configured from the validated `DATABASE_URL`.
 */
export const pool = new Pool({ connectionString: env.DATABASE_URL });

/**
 * Drizzle ORM client. `schema` is intentionally empty in the skeleton — there
 * are no domain tables yet. Domain schema will be added under `db/schema`.
 */
export const db = drizzle(pool, { schema });
