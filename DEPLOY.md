# Deploy with Coolify

Coolify on the Ubuntu 24.04 VPS builds this repo with the **Docker Compose** build pack (`coolify-compose.yml`). Traefik (Coolify’s proxy) terminates TLS. There is no Caddy, no GHCR, and no GitHub Actions deploy workflow.

Public hostnames (example): site `https://example.com`, API `https://api.example.com`, MinIO `https://s3.example.com`.

## 1. Install Coolify

As root on the VPS (official installer; it installs Docker if needed):

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Wait until it prints the dashboard URL (`http://<server-ip>:8000`). Open it, create the first admin user, and store those credentials.

Optional: in **Settings → Configuration**, set an **Instance Domain** (e.g. `https://coolify.example.com`) so the UI and GitHub App webhooks use HTTPS on 443 instead of port 8000. DNS A record for that hostname → the VPS.

## 2. Lock down port 8000

Coolify’s installer listens on **8000**. Do not leave it on the public internet.

After the admin user exists (and after the instance domain works, if you set one):

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 8000/tcp
ufw --force enable
```

**SSH tunnel** (if you did not set an instance domain, or for emergency access):

```bash
ssh -L 8000:127.0.0.1:8000 root@<server-ip>
```

Then open `http://127.0.0.1:8000`.

GitHub App webhooks need a **public HTTPS URL** for Coolify (instance domain on 443). A tunnel-only dashboard without an instance domain cannot receive GitHub webhooks.

## 3. GitHub App + application

1. Coolify → **Sources** → **GitHub App** → create/install the app on `alpha-sadio-diallo/Convoy_Project` (or your fork) with repo access.
2. **Projects** → create a project (e.g. `carpool`) → **New Resource** → **Private Repository (GitHub App)**.
3. Pick the repo and branch (`main`).
4. **Build Pack:** Docker Compose.
5. **Docker Compose Location:** `coolify-compose.yml` (repo root).
6. Save. Coolify parses the services.

## 4. Domains (three FQDNs)

In the resource, assign domains so they match the magic env vars in `coolify-compose.yml`:

| Compose service | Magic var | Container port | DNS |
|---|---|---|---|
| `web` | `SERVICE_FQDN_WEB_3000` | 3000 | `example.com` (and `www` if you want) |
| `api` | `SERVICE_FQDN_API_3001` | 3001 | `api.example.com` |
| `minio` | `SERVICE_FQDN_MINIO_9000` | 9000 | `s3.example.com` |

DNS **A/AAAA** for those three names → the VPS. Coolify’s proxy issues Let’s Encrypt certs (ports 80 and 443 must stay open).

Set application env vars to the same public URLs:

- `BETTER_AUTH_URL` = `https://api.example.com`
- `TRUSTED_ORIGINS` = `https://example.com,https://api.example.com`
- `S3_PUBLIC_ENDPOINT` = `https://s3.example.com`
- `S3_CORS_ALLOW_ORIGIN` = `https://example.com`
- `NEXT_PUBLIC_API_URL` = `https://api.example.com` (**build-time**)

Google callback: `https://api.example.com/api/auth/callback/google`. Webhooks: `https://api.example.com/webhooks/stripe` and `.../paypal`.

## 5. Environment variables

Paste from `deploy/.env.example` into Coolify → **Environment Variables**. The complete list (build vs runtime, required, where the value comes from) is in [COOLIFY.md](./COOLIFY.md). Do not commit real values.

**Build-time** (also declared under `web.build.args`). Changing any of these **requires a rebuild**, not a restart:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | Required. Public API origin; inlined into the Next.js bundle |
| `NEXT_PUBLIC_WS_URL` | Optional; empty derives `wss://` from the API URL |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Optional |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Optional |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | Optional; truthy shows the Google button |

**Runtime** (restart is enough): everything else listed in [COOLIFY.md](./COOLIFY.md). `PAYMENT_WORKER_EMBEDDED` defaults to `false` on `api`.

Generate secrets with `openssl rand -base64 32`. URL-encode the password inside `DATABASE_URL` and `REDIS_URL` (`redis://:<encoded>@redis:6379`). Use compose hostnames `postgres`, `redis`, `minio` — not localhost.

`SERVICE_FQDN_WEB_3000`, `SERVICE_FQDN_API_3001`, and `SERVICE_FQDN_MINIO_9000` are Coolify magic; assign domains in the UI rather than inventing extra app env vars.

## 6. Deploy

Click **Deploy**. Coolify clones, builds `Dockerfile` (api, api-migrate, payment-worker) and `Dockerfile.web`, then `docker compose up`. `api` and `payment-worker` wait until `api-migrate` exits 0 (`service_completed_successfully`). `minio-init` creates `$S3_BUCKET` if missing (private, no anonymous policy).

## 7. Logs

- Coolify resource → **Logs** (pick a service: `web`, `api`, `payment-worker`, …).
- Server: `docker logs` on the container Coolify named for that service (names are prefixed with the resource id).

Compose also uses json-file rotation (`max-size: 10m`, `max-file: 3`).

## 8. Rollback

Resource → **Deployments** → open a previous successful deployment → **Rollback** (or redeploy that commit). Coolify recreates containers from that revision. Named volumes (`postgres_data`, `redis_data`, `minio_data`) are not rewound; schema migrations are forward-only — rolling back app code onto a newer DB may fail.

## 9. Postgres backups (scheduled tasks)

Coolify’s **Backups** tab applies to standalone database resources. This Postgres is a compose service, so use **Scheduled Tasks** on the application:

1. Resource → **Scheduled Tasks** → add task.
2. Container: `postgres`.
3. Command (runs inside the container; uses its env):

```bash
sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

4. Cron, e.g. `15 3 * * *` (daily 03:15).

Stdout is stored as the task result in Coolify (fine for small DBs). For a file on the server, use a command that writes into a volume you then copy off-box — this compose file has no extra backup volume. Optionally pipe to S3 from a task if you add that later; do not put secrets in the task name.

---

Local development is unchanged: `pnpm docker:up` still uses root `docker-compose.yml`.
