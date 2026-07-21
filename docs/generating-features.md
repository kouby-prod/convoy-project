# Generating features

This project ships **feature generators** so every new feature follows the same
conventions. There are two ways to use them:

1. **With Claude Code** — type `/backend-feature` or `/frontend-feature`,
   describe the feature in plain language, and it runs the generator and fills
   in the rest.
2. **By hand** — run `pnpm gen …` yourself and edit the generated files.

Both produce identical scaffolding, because both use the same Plop templates.

| Piece | Where it lives |
| --- | --- |
| Generator config | [`plopfile.mjs`](../plopfile.mjs) |
| Templates | [`tools/plop-templates/`](../tools/plop-templates/) |
| Skills | [`.claude/skills/`](../.claude/skills/) |

---

## Prerequisites

```bash
pnpm install          # once, after cloning
docker --version      # Docker Desktop must be running for the DB + full stack
```

---

## Backend feature

### 1. Generate

```bash
pnpm gen backend-feature rides
```

Creates:

| File | Purpose |
| --- | --- |
| `packages/schemas/src/rides.ts` | Zod contract — **the single source of truth** |
| `apps/api/src/db/rides.ts` | Drizzle table |
| `apps/api/src/modules/rides/rides.routes.ts` | OpenAPI route definitions |
| `apps/api/src/modules/rides/index.ts` | `OpenAPIHono` sub-app (handlers + auth) |
| `apps/api/tests/rides/rides.test.ts` | Starter Vitest tests |

It also appends the new exports automatically at the `// plop:schemas` and
`// plop:tables` markers. **Do not remove those marker comments.**

### 2. Fill in the domain

Replace every `TODO(domain)` comment:

- **Schema** — swap the placeholder `label` field for your real fields.
- **Table** — make the columns match the schema.
- **Routes** — add update/delete if you need them; adjust auth (the module
  guards `POST` with `requireAuth` by default; add `requireRole('admin')` for
  admin-only mutations).

> **Watch out for dates.** A timestamp is a `string` in the Zod contract but a
> `Date` in the Drizzle column. Convert on the way in
> (`new Date(body.departAt)`) and on the way out (`row.departAt.toISOString()`
> inside `serialize`). The template only handles `createdAt` for you.

### 3. Mount it (the one manual wiring step)

In [`apps/api/src/app.ts`](../apps/api/src/app.ts), import the module and add it
to the **chained `routes` const**:

```ts
import { ridesModule } from './modules/rides';

const routes = app
  .openapi(/* … existing routes … */)
  .route('/', ridesModule);   // ← add here
```

It must go inside that chain. `AppType = typeof routes` is what the typed RPC
client binds to — mounting anywhere else means the routes won't appear in
Swagger and the frontend won't see them.

### 4. Migrate

```bash
pnpm docker:infra                          # start Postgres + Redis
pnpm --filter @carpool/api db:generate     # writes apps/api/drizzle/NNNN_*.sql
pnpm --filter @carpool/api db:migrate
```

Commit the generated `.sql` file — migrations are part of the codebase.

### 5. Verify

```bash
pnpm --filter @carpool/api lint
pnpm --filter @carpool/api typecheck
pnpm --filter @carpool/api test
```

Then test it live:

```bash
pnpm docker:up      # full stack
```

Open **http://localhost:3001/docs** and try the endpoints:

1. Find your endpoints under the feature's tag. **Missing? The module isn't
   mounted** (step 3).
2. `GET /rides` → **Try it out** → **Execute** → expect `200`.
3. `POST /rides` → expect `401` without auth. To test authenticated: sign in via
   `POST /api/auth/sign-in/email`, copy the **`set-auth-token`** response
   header, click **Authorize**, paste it as the Bearer value, then Execute →
   expect `201`.

---

## Frontend feature

### 1. Generate

```bash
pnpm gen frontend-feature rides
```

Creates:

| File | Purpose |
| --- | --- |
| `apps/web/src/app/[locale]/rides/page.tsx` | Locale-aware page (server component) |
| `apps/web/src/components/rides/rides-list.tsx` | Client component, TanStack Query via the typed client |

> The backend endpoint must already exist **and be mounted**, otherwise the
> typed client has no `api.rides` and typecheck fails.

### 2. Add translations — both files

Add a namespace (e.g. `Rides`) with `title`, `subtitle`, `loading`, `empty`,
`error` to **both**:

- [`apps/web/messages/fr.json`](../apps/web/messages/fr.json) — **primary locale**, write natural French
- [`apps/web/messages/en.json`](../apps/web/messages/en.json) — same keys in English

Both files must have the **same key structure**. Never hardcode a user-facing
string in a component.

### 3. Fill in the domain

Replace the `TODO(domain)` placeholder (`item.label`) with your real fields.
For forms, copy the pattern in
[`signin-form.tsx`](../apps/web/src/components/auth/signin-form.tsx): loading and
error state, disabled submit while pending, translated labels.

### 4. Verify

```bash
pnpm --filter @carpool/web lint
pnpm --filter @carpool/web typecheck
pnpm docker:up
```

Load **http://localhost:3000/rides** (French) and **/en/rides** (English).
Check the loading, empty and error states, and the browser console for missing
translation warnings.

---

## Rules the generators assume

These are enforced by lint and typecheck — generated code already follows them:

- **No `any`**, no non-null `!`. Types come from `@carpool/schemas` /
  `@carpool/api-client`. The strict config has `noUncheckedIndexedAccess`, so
  guard values that may be `undefined`.
- **Zod is the single source of truth.** Never hand-write an API type twice.
- **No home-rolled crypto.** BetterAuth owns sessions, hashing and CSRF.
- **No hardcoded UI strings.** Everything goes through next-intl, in fr *and* en.
- **Reuse the design system** (`components/ui/*`, CVA variants, `cn`). No raw
  `<button>`, no arbitrary hex colours.

---

## Changing the conventions

Edit the templates in [`tools/plop-templates/`](../tools/plop-templates/) — **not**
the individual generated files. That is the whole point of the generator: fix a
template once and every future feature inherits the fix.

---

## Troubleshooting

| Symptom | Cause & fix |
| --- | --- |
| `Property 'rides' does not exist` on the API client | The module wasn't exported as the **chained** `.openapi(...)` result, or isn't mounted in the `routes` chain in `app.ts`. Both drop the route types. |
| New endpoints missing from `/docs` | The module isn't mounted in the `routes` chain (backend step 3). |
| Generator aborts: file already exists | `add` actions never overwrite. Delete the generated files (or pick a different name) and re-run. |
| Type error inserting a timestamp | Convert `string` → `Date` on insert and `Date` → ISO string in `serialize`. |
| Web Docker build: `Cannot find module '@carpool/schemas'` | `apps/api/package.json` must be copied in the `deps` stage of [`infra/Dockerfile.web`](../infra/Dockerfile.web); the web build typechecks the API source once it imports the typed client. |
| New export didn't get registered | The `// plop:schemas` / `// plop:tables` marker was removed, or text was added **after** it on the same line. The marker must be the end of its line. |
| Database looks empty / data "disappeared" | `pnpm docker:up` and `pnpm docker:infra` can attach different Postgres volumes (`carpool_postgres_data` vs `infra_postgres-data`). Check with `docker inspect carpool-postgres-1 --format "{{range .Mounts}}{{.Name}}{{end}}"`. Nothing is deleted — you're just looking at a different volume. |
