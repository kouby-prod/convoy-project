---
name: frontend-feature
description: Add a frontend feature/page to the Convoy/Carpool web app (apps/web). Runs the Plop generator to scaffold a locale-aware Next.js App Router page plus a typed TanStack Query data component, then adds the i18n keys (fr + en), fills the domain fields, and verifies. Use when a colleague asks to "add a page / screen / UI / form / component / view" (e.g. rides list, booking form, profile page).
---

# Frontend feature generator

The deterministic scaffolding is owned by a **Plop generator** (`plopfile.mjs` +
`tools/plop-templates/frontend/`). Your job is to run it, then do the parts a
generator can't: real translations, real fields, forms, and verification. Do
**not** hand-write the skeleton — regenerate or edit the templates instead.

## 1. Collect intent (ask only what's missing)
- **name** — becomes the route `/<name>` and the `PascalCase` i18n namespace.
- **what it shows/does** — list, detail, form, dashboard.
- **backend endpoint(s)** it consumes (build them first with `/backend-feature`
  if they don't exist — the typed client only exposes mounted routes).
- **auth-gated?** — if so, use `authClient.useSession()` from `@/lib/auth-client`.

## 2. Run the generator
```
pnpm gen frontend-feature <name>
```
This creates:
- `apps/web/src/app/[locale]/<name>/page.tsx` (server component, locale-aware)
- `apps/web/src/components/<name>/<name>-list.tsx` (`'use client'`, TanStack
  Query against the typed `@carpool/api-client`)

## 3. Add i18n keys — BOTH message files (the generator can't translate)
Add a `<PascalCase name>` namespace with `title`, `subtitle`, `loading`,
`empty`, `error` (plus any labels) to:
- `apps/web/messages/fr.json` — **primary locale**; write natural, simple French.
- `apps/web/messages/en.json` — same keys, English.

The two files must have identical key structure. French is `defaultLocale`
(`apps/web/src/i18n/routing.ts`).

## 4. Fill the domain (replace every `TODO(domain)`)
- Point the query at the real endpoint: `api['<name>'].$get()` (already typed
  from the backend contract — never re-type API shapes).
- Render the real fields in the component (replace the placeholder `item.label`).
- For a **form**, mirror `apps/web/src/components/auth/signin-form.tsx`:
  controlled submit, `isLoading`/`error` state, semantic `Input`
  (`type`/`name`/`required`), disabled-while-pending, translated labels, and a
  `useMutation` + `queryClient.invalidateQueries` on success. Validate against
  the `@carpool/schemas` request schema before sending.

## 5. Navigation (if the page should be discoverable)
Add a locale-aware `Link` from `@/i18n/navigation` (never bare `next/link`) in
the navbar or parent, with a translated label added to both message files.

## 6. Verify (required — report actual output)
```
pnpm --filter @carpool/web lint
pnpm --filter @carpool/web typecheck
```
Then confirm it renders against the real stack (this project verifies in Docker,
not just `next dev`):
```
pnpm docker:up      # web at http://localhost:3000
```
Load `/<name>` (French) and `/en/<name>` (English); check loading/empty/error
states and the console for missing-translation warnings. Fix and re-run if
anything fails. Do **not** commit or push — leave git to the user.

## Non-negotiable conventions (enforced by lint/typecheck)
- No hardcoded UI strings — every string is a next-intl key in BOTH fr + en.
- Reuse the design system (`components/ui/*`, CVA variants, `cn` from
  `@/lib/utils`, token classes like `bg-primary`/`text-muted-foreground`) — no
  raw `<button>` or arbitrary hex.
- No `any` — types come from `@carpool/schemas` / `@carpool/api-client`.
- Server components by default; add `'use client'` only for hooks/state/events.
- Navigation via `@/i18n/navigation`, not `next/link` / `next/navigation`.

## To change the conventions for everyone
Edit the templates in `tools/plop-templates/frontend/` — not individual
generated files.
