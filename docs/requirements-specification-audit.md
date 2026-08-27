# CAN-VOITURAGE — Requirements Specification Audit

**Technical Audit — `main` branch, with a same-day follow-up on `feat/geolocation`**

Line-by-line comparison between the provided requirements specification and the actual implementation found in the `Convoy_Project` repository (Turborepo monorepo: Hono API, Next.js web, Expo mobile).

- **Audit date** — August 26, 2026
- **Follow-up date** — August 26, 2026 (same day — see "Update Since the Audit" for what changed)
- **Reference** — `main` branch, commit `03450d1`; follow-up reviewed against the working tree of `feat/geolocation` (based on `03450d1`, not yet committed/merged)
- **Method** — direct code review (routes, Drizzle schemas, components), no execution in a live environment

---

## 00 — Executive Summary

Qualitative estimate of functional coverage by domain, based on a review of the code (API routes, Drizzle tables, web pages). These are not automatically measured metrics and should be validated through user testing and a formal security review. **Figures below are scoped to `main` only** — see "Update Since the Audit" for unmerged branch work that is not reflected in these percentages.

| Domain | Estimated Coverage |
|---|---:|
| Accounts & Authentication | 90% |
| Trips & Booking | 90% |
| Messaging | 95% |
| Reviews & Ratings | 90% |
| Payments | 95% |
| Notifications | 60% |
| Geolocation | 65% |
| Documents / Verification | 50% |
| Admin Panel | 85% |
| **Mobile App** | **10%** |
| **PIPEDA Compliance** | **40%** |
| **Production / Deployment** | **25%** |

> **Quick overview.** The web back end (API + web interface) is significantly more advanced than suggested by the repository's `README.md`, which still describes it as a "skeleton with no business logic" — this description is outdated. In practice, trips, bookings, payments (Stripe + PayPal, GST/QST taxes, invoicing), real-time messaging, and reviews are functional and tested. Conversely, the **mobile application** and the **production compliance/deployment aspects** are significantly behind the rest of the project and the requirements specification. **Geolocation has moved furthest since the audit was written** (see the addendum below) but remains unmerged, so it does not change the 65% figure above.

### Status Legend

- ✅ **Compliant** — implemented and matches the requirement
- 🟡 **Partial** — partially implemented, or with a narrower scope than the requirement
- ❌ **Missing** — not found in the code
- 🔵 **Beyond** — the implementation exceeds what is required by the specification
- ⚪ **To be verified** — cannot be determined through code review alone

---

## 4.1 — Passenger Features

| Requirement | Status | Findings |
|---|---|---|
| Account creation (email, phone, social networks) | ✅ Compliant | Email + password, phone + OTP (6 digits), Google OAuth — `apps/api/src/auth/auth.ts`. No other social network is wired in (no Facebook/Apple). |
| Secure authentication | ✅ Compliant | better-auth: httpOnly cookies, bearer tokens for mobile/API, mandatory email verification, rate limiting, CSRF protection through trusted origins. |
| Search by departure/destination city / date / time | ✅ Compliant | `TrajetApiSearchQuerySchema` — `packages/schemas/src/trajet.ts`, `GET /trajets` route. |
| Filters (price, driver rating, comfort, luggage) | 🔵 Beyond | All 4 requested filters are present, plus geographic proximity search, stop policies, and declared equipment — beyond the requested scope. |
| Listing browsing | ✅ Compliant | `apps/web/src/app/[locale]/trajets`, `/search`. |
| Seat booking | ✅ Compliant | `POST /trajets/{id}/book`, seat management, invoice issued immediately. |
| Internal messaging with the driver | 🔵 Beyond | Real-time WebSocket chat (rather than simple polling), with multi-instance broadcasting through Redis/BullMQ — `apps/api/src/realtime/hub.ts`. |
| Rating and review system | ✅ Compliant | Two-way 1–5 ratings, one review per booking and direction — `review` table. |
| Trip history | ✅ Compliant | `GET /me/bookings`, `mes-reservations` page. |

---

## 4.2 — Driver Features

| Requirement | Status | Findings |
|---|---|---|
| Driver profile creation and management | ✅ Compliant | `vehicle` module (vehicle, photos) + `driver_eligibility`. |
| Trip creation (city, date/time, seats, price) | ✅ Compliant | `POST /trajets` — all requested fields are present. |
| Booking management | ✅ Compliant | `GET /trajets/{id}/bookings`, driver dashboard. |
| Passenger acceptance / rejection | 🟡 Partial | The endpoint exists (`PATCH .../bookings/{id}`), but the current flow moves a booking directly to `awaiting_payment` and then `confirmed` once payment is made — the manual driver acceptance step appears to be largely bypassed by immediate payment. |
| Listing history | ✅ Compliant | `mes-trajets` page, `GET /me/trajets`. |
| Passenger ratings | ✅ Compliant | `driver_to_passenger` direction of the `review` module. |

---

## 4.3 — Shared Features

| Requirement | Status | Findings |
|---|---|---|
| Email notifications | ✅ Compliant | SMTP in production, console stub in development — `src/auth/email.ts`, `notification` module. |
| Mobile push notifications | ❌ Missing | No Expo/FCM/APNs push token found on `main`. `feat/notifications` (unmerged) adds browser Web Push (VAPID), not native mobile push — the mobile app also has no screens, see §6. |
| Geolocation | 🟡 Partial | On `main`: address → coordinates geocoding, Leaflet map for selecting/displaying departure and destination, proximity search — `geocode` module. No real-time GPS tracking of the driver during the trip. **Materially more advanced on the unmerged `feat/geolocation` working tree — see the addendum below.** |
| Customer support | 🟡 Partial | Contact form — `contact` module. No help center, FAQ, or dedicated support chat identified. |
| Account settings | ✅ Compliant | `parametres` page, notification preferences, account deletion with a 30-day delay + scheduled purge. |
| Document management (ID, driver's license) | 🟡 Partial | Only the **driver's license** is actually required and verified by an admin (`REQUIRED_DRIVER_DOCUMENT_TYPES = ['permis']`). Insurance and vehicle registration are *self-declared* and not verified; legacy types (ID card, registration certificate) still exist in the database but are no longer requested — as explicitly noted in `packages/schemas/src/document.ts`. |

---

## 5 — User Interface (UI/UX)

| Requirement | Status | Findings |
|---|---|---|
| Simplicity / fast access / intuitive navigation | ⚪ To be verified | User experience assessment requires browser testing and cannot be determined through code review alone. |
| Clean design | ⚪ To be verified | shadcn/ui components are present (`apps/web/src/components/ui/`) and appear visually consistent in the code, but this must be validated visually. |
| Dominant green and yellow colors | ✅ Compliant | `--brand-yellow:#e2d200`, `--brand-green:#26b053` — `apps/web/src/app/globals.css`. Used respectively as primary and secondary colors. The new geolocation UI reuses these tokens (pulsing brand-green "live" indicator, brand-yellow live map pin), consistent with the rest of the app. |
| Visible action buttons, explicit icons | ⚪ To be verified | Component structure is present; visual rendering was not verified during this audit. |
| Responsive design | 🟡 Partial | Web application built with Tailwind (responsive by default). The mobile app, however, has virtually no screens (§6), so the multi-device responsiveness requirement is covered only on the web side. |

---

## 6 — Technical Architecture

| Requirement | Status | Findings |
|---|---|---|
| Web front end: React / Vue.js | ✅ Compliant | Next.js 16 / React 19, App Router — `apps/web`. |
| Mobile front end: Flutter or React Native | 🟡 Partial | Technology is compliant (Expo / React Native, SDK 56), but the application itself is a 2-file skeleton (`app/_layout.tsx`, `app/index.tsx`) that only calls `/ping`. No business screens (login, search, booking, etc.). |
| Back end: secure REST API (Node.js / Java / Laravel) | ✅ Compliant | Node.js, Hono framework + `@hono/zod-openapi`, with automatically generated Swagger documentation at `/docs`. |
| PostgreSQL / MySQL database, sensitive data encrypted | 🟡 Partial | PostgreSQL + Drizzle ORM confirmed. No at-rest encryption configuration was found in the repository — this likely depends on the selected cloud provider and cannot be verified here. |
| Cloud hosting (AWS/GCP/Azure, Canada region), automatic scalability | ❌ Missing | No IaC (Terraform/Pulumi), no cloud configuration, and no CI/CD pipeline (`.github/workflows` absent). Only `docker-compose.yml` and `infra/docker-compose.infra.yml` exist, for local development only. |

---

## 7 — Security and Regulatory Compliance (Canada)

| Requirement | Status | Findings |
|---|---|---|
| PIPEDA / LPRPDE compliance | 🟡 Partial | `privacy` page explicitly mentions PIPEDA, with account deletion after a delay + purge. No evidence in the code of a data-processing register or formal compliance audit — the foundations exist, but full legal compliance remains to be validated outside the code. |
| Data encryption (HTTPS, SSL) | ⚪ To be verified | No TLS configuration (nginx/Traefik/certbot) found in `infra/` — HTTPS would depend on the production hosting platform, which has not yet been deployed. |
| User consent management | ⚪ To be verified | No consent banner or consent logging mechanism was identified during the review. |
| Data retention and deletion | ✅ Compliant | `account-deletion` module: 30-day retention period followed by an automatically scheduled purge. |
| Terms and Conditions | ✅ Compliant | `cgv`, `terms`, `responsibility`, `contrat-conducteur` pages. |
| Privacy Policy | ✅ Compliant | `privacy` page. |

---

## 8 — Payments and Monetization

| Requirement | Status | Findings |
|---|---|---|
| Commission on each trip | ✅ Compliant | Fixed commission of CAD $4.00 per booking, in addition to the trip fare — `COMMISSION_AMOUNT_CENTS = 400`, `packages/schemas/src/payment.ts`. |
| Compliant payment integration (Stripe, PayPal) | ✅ Compliant | Stripe (PaymentIntents, saved cards, 3DS) *and* PayPal (order capture) — both payment providers requested in the specification are present. |
| Transparent billing | 🔵 Beyond | Sequential invoice numbering, PDFs, credit notes, GST (5%) + QST (9.975%) explicitly modeled on the commission — `modules/payment/tax.ts`. This is supplemented by a double-entry ledger, payment reconciliation, incident/dispute tracking, and driver payouts: significantly beyond what is required by the specification. |

> **Note.** Driver payouts are *manual* (an admin marks a payout as paid) — there is no Stripe Connect or automated bank transfer.

---

## 9 — Deployment

| Requirement | Status | Findings |
|---|---|---|
| Development environment | ✅ Compliant | `docker-compose.yml` + a single root `.env`, complete stack (Postgres, Redis, MinIO, GlitchTip, ntfy). |
| Staging environment | ❌ Missing | No separate compose file or configuration for a staging environment. |
| Production deployment | ❌ Missing | No CI/CD pipeline or cloud deployment configuration found in the repository. |
| Google Play Store publication | ❌ Missing | Not applicable until the mobile app has business screens (§6). |
| Apple App Store publication | ❌ Missing | Same. |

---

## 10 — Maintenance and Future Development

This section of the requirements specification is prospective; the most reliable indicator today is test coverage, which determines the ability to evolve the code without introducing regressions.

| Area | Automated Tests | Findings |
|---|---|---|
| `apps/api` | ✅ Good coverage | 21 Vitest test files on `main` covering authentication, payments, trips, messaging, reviews, documents, admin, notifications, queues, etc. `feat/geolocation` adds 3 more (`access`, `store`, `tracking` — ~509 lines), unmerged. |
| `apps/web` | ❌ No tests | No test files found — risk of silent regressions in the product's most widely used interface. |
| `apps/mobile` | ❌ No tests | Consistent with the absence of business screens. |
| CI/CD | ❌ Missing | No GitHub Actions workflow or other CI system — existing tests are not automatically executed on every change. |

---

## 12 — Expected Deliverables

| Deliverable | Status | Findings |
|---|---|---|
| Approved requirements specification | ⚪ Outside repository | The source document for this audit — formal approval is a contractual process, not a code artifact. |
| UI/UX mockups | ⚪ To be verified | No mockup folder (Figma exports, wireframes) identified in the repository — likely managed outside the code repository, if they exist. |
| Web application | ✅ Compliant | The most advanced of the three targets — see §4 and §8. |
| Android / iOS application | ❌ Missing | Expo skeleton without business screens — see §6. |
| Technical documentation | 🟡 Partial | `docs/` contains architectures for geolocation and notifications, feature specifications, and a guide for the code generator (Plop). The geolocation doc in particular now includes a detailed "what was actually built" section documenting the implementation and its deliberate deltas from the original design (see addendum). The root `README.md`, however, is largely outdated (it still describes the project as a skeleton without payments or geolocation). |
| User documentation | ❌ Missing | No end-user guide identified. |

---

# Overall Verdict and Recommendations

## Strengths

- Core business functionality (trips, booking, payments, messaging, reviews) is more complete and polished than required by the specification, with solid testing discipline on the API side.
- Canadian payments and taxation (GST/QST) are handled with an unusually high level of accounting rigor for this stage of the project (ledger, reconciliation, sequential invoices).
- The green/yellow brand identity is faithfully implemented through the CSS tokens, including in newly built features.
- Robust, multi-channel authentication is already in place (email, phone, Google).
- Real-time infrastructure (Redis pub/sub + WebSocket hubs) is a proven, reused pattern: chat → notifications → geolocation each mirror the same `Hub` shape, which has kept each addition small and consistent.

## Major Gaps to Address as a Priority

- **Mobile application**: needs to be almost entirely rebuilt — this represents one third of the contractual scope ("Web & Mobile Android/iOS") and is not yet functionally implemented.
- **Document verification**: only the driver's license is verified; insurance and identity documents remain self-declared, creating regulatory/security risk for a transportation service.
- **Lack of CI/CD and staging environment**: no automated safety net exists before production deployment.
- **PIPEDA compliance and encryption in transit/at rest**: foundations are in place (privacy page, account purge), but no formal audit has been conducted; HTTPS is not configured in the repository.
- **Mobile push notifications**: still missing. `feat/notifications` (unmerged) covers browser Web Push only — no Expo/FCM/APNs integration exists, and there is nothing to receive it on since the mobile app has no screens.
- **Real-time GPS tracking**: no longer a pure gap — it is now implemented end-to-end (backend + web UI) on the unmerged `feat/geolocation` working tree (see addendum). The remaining gap is that neither `feat/geolocation` nor `feat/notifications` is merged into `main`, and geolocation tracking is web-only by necessity, since the mobile app has no screens to extend it to.
- **Branch consolidation**: two feature branches (`feat/notifications`, `feat/geolocation`) now sit meaningfully ahead of `main` with completed, tested backend work. Merging them (after review) would materially move the Notifications and Geolocation coverage figures in the executive summary above their current main-branch estimates.

> **Note regarding the repository README.** The root `README.md` still describes the project as "a skeleton with no business logic, no payments, and no geolocation." This is no longer accurate: these two areas are actually among the most mature parts of the project. The README should be updated to reflect the actual state before any external presentation of the repository.

---

## Update Since the Audit

Two workstreams have been started since the initial audit, on dedicated branches that have **not been merged into `main`** (and are therefore not reflected in the tables above):

- **`feat/notifications`** (commit `e28f4d1`) — addition of a browser push notification channel (Web Push/VAPID), with the backend and interface completed and covered by automated tests.
- **`feat/geolocation`** — live location sharing during a trip (driver → confirmed passengers). At the time of the initial audit this was backend-complete with the web interface "being finalized." **As of this same-day follow-up, the web integration is complete as well** — see below.

### Addendum — `feat/geolocation`, same-day follow-up

Reviewed against the current (uncommitted, staged) working tree of `feat/geolocation`, based on `main`'s `03450d1`.

**Backend** — a new `tracking` module (`apps/api/src/modules/tracking/`: `access.ts`, `events.ts`, `store.ts`, `tracking.routes.ts`, `index.ts`) plus a real-time layer (`apps/api/src/realtime/location-hub.ts`, `location-ws.ts`), wired into `app.ts` and `server.ts`. Storage is Redis-only (`SET …EX 120`, one key per trajet — no new Postgres table), fan-out mirrors the existing `MessageHub`/`NotificationHub` pattern (`psubscribe('location:trajet:*')`), and `GET /ws/location` reuses the codebase's existing WebSocket auth pattern (cookie/bearer/`?token=`, `WS_CLOSE_UNAUTHORIZED`). `POST /trajets/{id}/location` is driver-only and rate-limited (30/min, in-memory limiter — same known limitation as the rest of the codebase). Access control (`resolveTrajetLocationAccess`) is shared between REST and WebSocket and denies access when the trip is cancelled or outside a computed sharing window (`departureAt − 2h` to `arrivalAt + 2h`, or `departureAt + 12h` as a fallback when there's no ETA) — a deliberate, schema-migration-free substitute for an explicit trip-lifecycle state machine (documented trade-off: coarser than a "driver pressed start" signal, revisit if the product needs trip-in-progress state for other reasons). New shared contract: `packages/schemas/src/tracking.ts`. 3 new test files, ~509 lines (`apps/api/tests/tracking/{access,store,tracking}.test.ts`).

**Web frontend — now complete, not just "in progress":**
- Driver side: a `LiveLocationShare` card (`apps/web/src/components/trajets/live-location-share.tsx`) in the trip-management tab of the driver workspace, with a start/stop control backed by `use-live-location-share.ts` (`navigator.geolocation.watchPosition`, throttled to roughly one send per 8–10s).
- Passenger side: `use-trajet-live-location.ts` (WebSocket via `use-trajet-location-socket.ts`, with a REST-poll fallback when the socket isn't connected — the same fallback pattern already used for the message thread) feeds a live pin into `trajet-detail.tsx`, alongside the existing static departure/arrival pins.
- Map: `TripMap`/`TripMapInner` gained a pulsing yellow "live" pin kind and a `preserveViewOnUpdate` flag so the map re-fits once when live tracking starts rather than re-centering on every ping (which would otherwise fight a passenger's manual pan/zoom).
- i18n: new strings added to both `apps/web/messages/en.json` and `fr.json` (driver controls: title/description/start/stop/error states; passenger: a "sharing live" indicator).

**Documentation**: `docs/geolocation-system-architecture.md` was extended with a "What was actually built" section (§4) that documents two deliberate deltas from the original design (the trip-window heuristic above, and a 120s cache TTL — up from the originally proposed 30s — to match the client's ~8–10s send throttle with slack for missed beats) and a full file map.

**Still explicitly out of scope** (unchanged from the original design): breadcrumb history, Redis geospatial "nearby" queries, PostGIS, background location on a closed/backgrounded mobile browser tab, and any mobile-app integration (the mobile app has no screens at all, so this feature is web-only by necessity).

**Net effect**: geolocation went from "backend done, web pending" to feature-complete on web for the driver-sharing → passenger-viewing flow, entirely on an unmerged branch. This does not move the 65% figure in the executive summary (which is scoped to `main`), but it is the single biggest change since the original audit and is the leading candidate for the next merge.

---

*Initial report generated through direct source-code review of the `main` branch (commit `03450d1`) on August 26, 2026. This revision adds a same-day follow-up on the `feat/geolocation` working tree. Does not include execution tests, a formal security audit, or a legal compliance review.*
