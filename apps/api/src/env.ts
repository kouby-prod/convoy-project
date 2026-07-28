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
  // Google OAuth (web redirect flow). Optional: when BOTH are set the Google
  // provider is enabled; otherwise it's simply off. Get them from Google Cloud
  // Console → OAuth 2.0 Client ID (Web application).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
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

  // --- Email sender ---
  // The "From" address used on outgoing email.
  EMAIL_FROM: z.string().default('no-reply@carpool.local'),
  // SMTP transport. When SMTP_HOST is set, real email is sent via SMTP;
  // otherwise the console stub is used (dev). SMTP_USER/PASS are optional so
  // local relays without auth (Mailpit/MailHog) work out of the box.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Use a TLS-on-connect port (465). Accepts "true"/"false"; anything else is false.
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value) => value === 'true'),

  // --- SMS sender ---
  // Display "From" label for the console stub.
  SMS_FROM: z.string().default('Carpool'),
  // Self-hosted SMS gateway (SMSGate "Local mode": the Android app runs an HTTP
  // server on the phone — no Firebase, no cloud). When SMS_GATEWAY_URL is set,
  // OTPs are sent via the phone; otherwise the console stub is used. User/pass
  // are the Basic-auth credentials shown in the SMSGate app. Left as optional
  // strings (not z.url) so an empty value cleanly means "use the console stub".
  SMS_GATEWAY_URL: z.string().optional(),
  SMS_GATEWAY_USER: z.string().optional(),
  SMS_GATEWAY_PASSWORD: z.string().optional(),

  // --- Object storage (MinIO, or any S3-compatible service) ---
  // Driver identity documents live here, never in Postgres. The API only ever
  // signs URLs; the browser transfers the bytes.
  //
  // Two endpoints on purpose: S3_ENDPOINT is how THIS process reaches the
  // bucket (a compose service name in Docker), while S3_PUBLIC_ENDPOINT is the
  // host embedded in presigned URLs, which the BROWSER has to resolve. They are
  // the same value when everything runs on the host.
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required (MinIO root user)'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required (MinIO root password)'),
  S3_BUCKET: z.string().min(1).default('carpool-documents'),
  // Lifetime of a presigned upload/view URL, in seconds. Short by design: the
  // link is handed out per action, not stored.
  S3_URL_TTL: z.coerce.number().int().positive().default(300),
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
