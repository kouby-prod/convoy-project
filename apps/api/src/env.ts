// Side-effect import: loads the root .env into process.env before we read it.
// Must be first so every consumer of `env` gets a populated environment.
import './load-env';
import { z } from 'zod';

/** Empty / whitespace env values mean "unset" so optional secrets stay optional. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  });

/**
 * Typed, validated environment. The process fails fast at boot if anything is
 * missing or malformed, instead of blowing up later at the first DB call.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (e.g. postgres://user:pass@localhost:5432/carpool)'),

  // --- Redis (BullMQ queues + WebSocket pub/sub fan-out) ---
  // Host default matches the infra redis service published on REDIS_PORT.
  // In Docker Compose the api service overrides this to redis://redis:6379.
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

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
  // The first entry doubles as the web app's own origin for building links in
  // notification emails (see apps/api/src/modules/trajet/notifications.ts) —
  // put the real web app URL first if you ever need more than one origin.
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
  // Support inbox the /contact form forwards to. Optional — falls back to
  // EMAIL_FROM (see apps/api/src/modules/contact/index.ts) when unset.
  SUPPORT_EMAIL: z.string().optional(),
  // SMTP transport. When SMTP_HOST is set, real email is sent via SMTP;
  // otherwise the console stub is used (dev). SMTP_USER/PASS are optional so
  // local relays without auth (Mailpit/MailHog) work out of the box.
  // optionalString so Coolify's empty `${SMTP_HOST:-}` is unset, not "".
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  // TLS-on-connect (port 465). Only true/1/yes are true; false/0/no are false.
  // Empty/unset is undefined so the mailer can default from the port (465 →
  // secure). Do NOT use z.coerce.boolean(): Boolean("false") === true.
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((value): boolean | undefined => {
      if (value === undefined) return undefined;
      const normalized = value.trim().toLowerCase();
      if (normalized === '') return undefined;
      if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
      if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
      return undefined;
    }),

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

  // --- Payments (optional — that provider returns 503 when unset) ---
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  PAYPAL_CLIENT_ID: optionalString,
  PAYPAL_CLIENT_SECRET: optionalString,
  PAYPAL_WEBHOOK_ID: optionalString,
  PAYPAL_MODE: z.enum(['sandbox', 'live']).default('sandbox'),

  // Seller identity printed on invoices. Tax numbers are omitted from the PDF
  // until set — never invent a GST/QST number.
  INVOICE_LEGAL_NAME: z.string().min(1).default('Kouby'),
  INVOICE_ADDRESS: z.string().optional().transform((value) => value?.trim() || undefined),
  INVOICE_GST_NUMBER: optionalString,
  INVOICE_QST_NUMBER: optionalString,
  // Quebec default: TPS 5 % + TVQ 9,975 % on the 4 CAD commission only.
  TAX_MODE: z.enum(['none', 'gst', 'gst_qst']).default('gst_qst'),

  // --- Observability (optional — incidents still email + admin inbox) ---
  // GlitchTip (or Sentry) DSN — envelope ingest. Host vs Docker hosts differ.
  SENTRY_DSN: optionalString,
  SENTRY_ENVIRONMENT: optionalString,
  // ntfy (self-hosted or ntfy.sh). Topic should be unguessable.
  NTFY_URL: optionalString,
  NTFY_TOPIC: optionalString,
  NTFY_TOKEN: optionalString,
  // Optional leftover — unused when ntfy is set.
  PAGERDUTY_ROUTING_KEY: optionalString,

  // When true (default), this process also consumes payment BullMQ jobs.
  // Docker API sets false; the `payment-worker` service consumes instead.
  PAYMENT_WORKER_EMBEDDED: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
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
