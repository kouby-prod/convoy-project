import { z } from 'zod';

/**
 * Typed, validated environment. The process fails fast at boot if anything is
 * missing or malformed, instead of blowing up later at the first DB call.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (e.g. postgres://user:pass@localhost:5432/carpool)'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Fail fast and loud — never start with a broken configuration.
    console.error(`\n[env] Invalid environment variables:\n${issues}\n`);
    process.exit(1);
  }

  return parsed.data;
}

export const env: Env = loadEnv();
