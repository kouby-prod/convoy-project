# Coolify environment variables

Compose file `coolify-compose.yml` is the source of truth. Coolify only lists variables written as `${VAR}` (or `${VAR:?}` / `${VAR:-}` / `${VAR:-default}`).

**Redeploy (rebuild web image)** vs **restart**:

- Change any `NEXT_PUBLIC_*` → **full redeploy / rebuild**. Next.js inlines them at `next build`. Restarting the container does nothing.
- Change any other row → **restart** (or redeploy without rebuilding the web image) is enough.
- Magic `SERVICE_FQDN_*` → assign domains in Coolify. Keep `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, `S3_PUBLIC_ENDPOINT`, and `NEXT_PUBLIC_API_URL` in sync with those hosts. `NEXT_PUBLIC_API_URL` is build-time.

Required (`${VAR:?}`) variables show first with a red border; Coolify blocks deploy until they are set.

| Variable | Build | Runtime | Required | Value comes from |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes (web `build.args` → Dockerfile `ARG`/`ENV`) | inlined in bundle | **yes** | You. Public API origin, must match `SERVICE_FQDN_API_3001` (e.g. `https://api.example.com`) |
| `NEXT_PUBLIC_WS_URL` | yes | inlined | no | You, optional. Empty → client derives `wss://<api-host>/ws/messages` from `NEXT_PUBLIC_API_URL` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | yes | inlined | no | Stripe Dashboard (`pk_…`). Empty hides Stripe in the UI |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | yes | inlined | no | PayPal developer dashboard. Empty hides PayPal JS |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | yes | inlined | no | You. Any truthy value (often the Google client id) shows the Google button |
| `INTERNAL_API_URL` | no | web | no | Derived: `http://api:3001` (compose DNS, not a public URL) |
| `SERVICE_FQDN_WEB_3000` | no | Coolify proxy | magic | Coolify. Assign `https://example.com` in the domain UI |
| `SERVICE_FQDN_API_3001` | no | Coolify proxy | magic | Coolify. Assign `https://api.example.com` |
| `SERVICE_FQDN_MINIO_9000` | no | Coolify proxy | magic | Coolify. Assign `https://s3.example.com` |
| `DATABASE_URL` | no | api, api-migrate, payment-worker | **yes** | Derived: `postgres://<POSTGRES_USER>:<url-encoded POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>` |
| `POSTGRES_USER` | no | postgres | no | You generate (e.g. `carpool`) |
| `POSTGRES_PASSWORD` | no | postgres | **yes** | You: `openssl rand -base64 32` |
| `POSTGRES_DB` | no | postgres | no | You generate (e.g. `carpool`) |
| `REDIS_URL` | no | api, payment-worker | no | Derived: `redis://:<url-encoded REDIS_PASSWORD>@redis:6379` |
| `REDIS_PASSWORD` | no | redis | no | You: `openssl rand -base64 32` |
| `BETTER_AUTH_SECRET` | no | api, payment-worker | **yes** | You: `openssl rand -base64 32` (≥32 chars) |
| `BETTER_AUTH_URL` | no | api, payment-worker | no | Derived from API public origin (`https://api.example.com`) |
| `TRUSTED_ORIGINS` | no | api, payment-worker | no | Derived: `https://example.com,https://api.example.com` |
| `PORT` | no | api | no | Default `3001` (container listen port; Traefik uses 3001 via `SERVICE_FQDN_API_3001`) |
| `PAYMENT_WORKER_EMBEDDED` | no | api | no | Default `false` (HTTP process must not consume BullMQ; `payment-worker` does) |
| `GOOGLE_CLIENT_ID` | no | api | no | Google Cloud Console OAuth client |
| `GOOGLE_CLIENT_SECRET` | no | api | no | Google Cloud Console |
| `EMAIL_FROM` | no | api | no | You. Empty → API default `no-reply@carpool.local` |
| `SUPPORT_EMAIL` | no | api | no | You. Empty → falls back to `EMAIL_FROM` |
| `SMTP_HOST` | no | api | no | Your SMTP provider. Empty → console stub |
| `SMTP_PORT` | no | api | no | Default `587` |
| `SMTP_USER` | no | api | no | SMTP provider |
| `SMTP_PASS` | no | api | no | SMTP provider |
| `SMTP_SECURE` | no | api | no | `true` only for port 465 |
| `SMS_FROM` | no | api | no | You / default `Carpool` |
| `SMS_GATEWAY_URL` | no | api | no | SMSGate. Empty → console stub |
| `SMS_GATEWAY_USER` | no | api | no | SMSGate |
| `SMS_GATEWAY_PASSWORD` | no | api | no | SMSGate |
| `S3_ENDPOINT` | no | api, payment-worker | no | Derived: `http://minio:9000` |
| `S3_PUBLIC_ENDPOINT` | no | api | no | Derived: same host as `SERVICE_FQDN_MINIO_9000` (`https://s3.example.com`) |
| `S3_CORS_ALLOW_ORIGIN` | no | minio | no | Derived: public site origin (`https://example.com`) |
| `S3_REGION` | no | api | no | Default `us-east-1` |
| `S3_ACCESS_KEY` | no | api, minio, minio-init | **yes** | You generate (MinIO root user) |
| `S3_SECRET_KEY` | no | api, minio, minio-init | **yes** | You: `openssl rand -base64 32` (MinIO min 8 chars) |
| `S3_BUCKET` | no | api, minio-init | **yes** | You (e.g. `carpool-documents`) |
| `S3_URL_TTL` | no | api | no | Default `300` |
| `STRIPE_SECRET_KEY` | no | api | no | Stripe Dashboard. Empty → payments 503 |
| `STRIPE_WEBHOOK_SECRET` | no | api | no | Stripe webhook signing secret |
| `PAYPAL_CLIENT_ID` | no | api | no | PayPal REST app |
| `PAYPAL_CLIENT_SECRET` | no | api | no | PayPal REST app |
| `PAYPAL_WEBHOOK_ID` | no | api | no | PayPal webhook id |
| `PAYPAL_MODE` | no | api | no | Default `sandbox` |
| `INVOICE_LEGAL_NAME` | no | api | no | You. Empty → API default `Kouby` |
| `INVOICE_ADDRESS` | no | api | no | You |
| `INVOICE_GST_NUMBER` | no | api | no | You |
| `INVOICE_QST_NUMBER` | no | api | no | You |
| `TAX_MODE` | no | api | no | Default `gst_qst` |
| `SENTRY_DSN` | no | api | no | GlitchTip/Sentry dashboard |
| `SENTRY_ENVIRONMENT` | no | api | no | You (e.g. `production`) |
| `NTFY_URL` | no | api | no | ntfy server |
| `NTFY_TOPIC` | no | api | no | You (unguessable topic) |
| `NTFY_TOKEN` | no | api | no | ntfy |
| `PAGERDUTY_ROUTING_KEY` | no | api | no | PagerDuty; unused if ntfy is set |

`DOMAIN` is **not** in compose on purpose: the app never reads it. Set the derived URL fields above instead.

Not in Coolify UI (not `${VAR}` in compose, not empty at runtime):

| Name | Why |
|---|---|
| `NODE_ENV` | Set to `production` in the Dockerfiles |
| `SEED_ADMIN_EMAIL` | Seed script only, not the HTTP/worker processes |
