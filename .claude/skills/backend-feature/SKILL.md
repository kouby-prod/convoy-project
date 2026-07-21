---
name: backend-feature
description: Add a backend feature (domain module) to the Convoy/Carpool API. Runs the Plop generator to scaffold the convention-following skeleton (shared Zod schema, Drizzle table, @hono/zod-openapi routes, module sub-app, test), then fills in the domain fields, wires it into app.ts, generates the migration, and verifies. Use when a colleague asks to "add an endpoint / API / backend feature / CRUD / module" (e.g. rides, bookings, vehicles, reviews).
---

# Backend feature generator

The deterministic scaffolding is owned by a **Plop generator** (`plopfile.mjs` +
`tools/plop-templates/backend/`), so every feature starts from byte-identical,
convention-correct files. Your job is to run it, then do the parts a generator
can't: real domain fields, wiring, meaningful tests, and verification. Do **not**
hand-write the skeleton files — regenerate or edit the templates instead.

## 1. Collect intent (ask only what's missing)
- **name** — singular bounded context, e.g. `rides`.
- **fields** — name, type, required/optional, defaults.
- **auth** — which endpoints need `requireAuth` / `requireRole('admin')`.
- **endpoints** — default to list + get-by-id + create; add update/delete if asked.

## 2. Run the generator
```
pnpm gen backend-feature <name>
```
This creates (and appends exports at the `// plop:*` markers):
- `packages/schemas/src/<name>.ts` + export in `packages/schemas/src/index.ts`
- `apps/api/src/db/<name>.ts` + export in `apps/api/src/db/schema.ts`
- `apps/api/src/modules/<name>/<name>.routes.ts`
- `apps/api/src/modules/<name>/index.ts` (the `OpenAPIHono` sub-app)
- `apps/api/tests/<name>/<name>.test.ts`

## 3. Fill the domain (replace every `TODO(domain)`)
- **Schema** (`packages/schemas/src/<name>.ts`): replace the placeholder `label`
  field with the real fields collected in step 1. This is the contract spine —
  it is the single source of truth; do not re-type shapes elsewhere.
- **Table** (`apps/api/src/db/<name>.ts`): match the columns to the schema.
- **Routes/module**: add update/delete routes if requested (mirror the existing
  create/get). For auth, the module already guards POST with `requireAuth`;
  adjust per the collected rules (add `requireRole('admin')` from `../../auth`
  for admin-only mutations). For abuse-prone endpoints, add rate-limit rules in
  BetterAuth's config in `apps/api/src/auth/auth.ts` (mirror the sign-in rules),
  not ad-hoc middleware.

## 4. Wire it into the app (the one manual edit the generator leaves)
In `apps/api/src/app.ts`: import the module and add it to the **chained `routes`
const** (the single expression whose `typeof` is `AppType`). Mounting outside
that chain breaks RPC types and Swagger.
```ts
import { <name>Module } from './modules/<name>';
// …add to the chain, e.g. after the last .openapi(...):
  .route('/', <name>Module)
```

## 5. Migration
```
pnpm docker:infra                          # start Postgres + Redis
pnpm --filter @carpool/api db:generate     # writes apps/api/drizzle/NNNN_*.sql
pnpm --filter @carpool/api db:migrate
```

## 6. Strengthen the test
The generated test covers list-200 and create-401. Add a happy-path create test
and any domain rules. Keep it hermetic (mock `../../src/db/client` and
`../../src/auth/auth` — see `apps/api/tests/auth/middleware.test.ts`).

## 7. Verify (required — report actual output)
```
pnpm --filter @carpool/api lint
pnpm --filter @carpool/api typecheck
pnpm --filter @carpool/api test
```
Then confirm end-to-end against the real stack (this project verifies in Docker,
not just dev servers):
```
pnpm docker:up
```

### Try it in Swagger (`/docs`)
Once the stack is up, exercise the new endpoints by hand:
1. Open **http://localhost:3001/docs**.
2. Find the new endpoints grouped under the **`<name>`** tag (the `tags` value
   from the routes) — if they are missing, the module was not mounted in the
   `routes` chain in `app.ts` (step 4).
3. **Public route** (e.g. `GET /<name>`): expand it → **Try it out** →
   **Execute** → expect **200** with a JSON array.
4. **Protected route** (e.g. `POST /<name>`):
   - First get a token: sign in via `POST /api/auth/sign-in/email` (or use an
     existing session). Copy the token from the **`set-auth-token`** response
     header.
   - Click **Authorize** (top-right), paste the token as the **Bearer** value,
     Authorize, Close.
   - Expand the route → **Try it out** → fill the request body → **Execute** →
     expect **201**. Without the token you should get **401**.
5. Confirm a created row persists: re-run `GET /<name>` and see it listed.

Fix and re-run if anything fails. Do **not** commit or push — leave git to the user.

## Non-negotiable conventions (enforced by lint/typecheck)
- No `any`, no non-null `!` — use `getAuth(c)`, guard `undefined` (the strict
  config has `noUncheckedIndexedAccess`).
- Zod in `@carpool/schemas` is the only source of API types.
- Errors return `{ error }` JSON with proper status; scripts catch `unknown` + `process.exit(1)`.
- No home-rolled crypto — BetterAuth owns sessions/hashing/CSRF.
- Every route carries OpenAPI metadata so it shows in `/docs`.

## To change the conventions for everyone
Edit the templates in `tools/plop-templates/backend/` — not individual generated
files. That is the point of the generator.
