// Side-effect import: loads the root .env into process.env before we read it.
// Must be first so every consumer of `env` gets a populated environment.
import './load-env';
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

  // --- BetterAuth ---
  // A strong secret is required: it signs sessions, tokens and cookies.
  // Generate one with: `openssl rand -base64 32`.
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters (use `openssl rand -base64 32`)'),
  // The canonical URL BetterAuth runs on (used for links in emails, cookies, etc.).
  BETTER_AUTH_URL: z.url().default('http://localhost:3001'),
  // Comma-separated list of origins allowed to make credentialed auth requests.
  TRUSTED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // --- Pluggable sender config (placeholders; console stubs are used in dev) ---
  // TODO: real email provider (Resend/SES/SMTP). Unused by the console stub.
  EMAIL_FROM: z.string().default('no-reply@carpool.local'),
  // TODO: Twilio (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM).
  // Unused by the console SMS stub; kept here so prod config has a home.
  SMS_FROM: z.string().default('Carpool'),
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
