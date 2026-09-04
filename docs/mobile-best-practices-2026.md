# CAN-VOITURAGE — Mobile Best Practices & Gaps (Expo / React Native, 2026)

**Scope** — `apps/mobile` on `feat/mobile`, reviewed against current (Sept 2026) Expo/React Native ecosystem practices and against the CAN-VOITURAGE cahier des charges (§4.3 Notifications, §6.1 mobile front-end stack, §9 Déploiement stores, §7 conformité PIPEDA/Loi 25).

**Method** — inspection of the actual code and installed dependency tree in this repo (`apps/mobile/package.json`, `pnpm-lock.yaml`, `app.json`, `lib/auth-client.ts`), cross-checked against current Expo/React Native documentation and ecosystem sources (listed at the end). Not a rewrite proposal — the mobile app already exists and is substantially built (auth, payments, messaging, live tracking, i18n, dark mode); this is a punch list of what to fix or add next.

> Note on the cahier des charges: §6.1 lists "Flutter ou React Native" for mobile. The project already committed to **Expo (managed) / React Native**, which is the right call here — it shares TypeScript types, Zod schemas, and the API client (`@carpool/schemas`, `@carpool/api-client`) with `apps/web` in the same Turborepo. Re-deriving the app in Flutter, or introducing Tauri, would throw that code-sharing away for no benefit; Tauri in particular is a WebView-wrapper for desktop/mobile of a *separately hosted* web app and doesn't fit a native Stripe/PayPal SDK + `expo-location` background-tracking app like this one.

---

## 1. Dependency mismatch — ✅ fixed

`react-native-reanimated@4.3.1` declared a peer of `react-native-worklets: 0.8.x`, but `0.9.2` was what actually resolved in the lockfile (pulled in transitively — `react-native-worklets` wasn't a direct dependency of `apps/mobile`). Bumped `react-native-reanimated` to `4.4.1` (targets `worklets@0.9.x`) and added `react-native-worklets@0.9.2` as an explicit direct dependency, then reinstalled and re-ran `typecheck` (passes). One residual warning remains from `expo-modules-core` itself wanting `worklets@^0.7.4 || ^0.8.0` — that's an upstream Expo SDK 56 peer range lagging the ecosystem, not a conflict in our own dependency graph; see §2 (SDK 57 upgrade) for the likely fix.

## 2. Consider the Expo SDK 57 upgrade

The app is on Expo SDK 56 / React Native 0.85, where the New Architecture is mandatory (no legacy-bridge fallback since SDK 56). That's already the correct posture. However, Hermes v1 (shipped with RN 0.85) has a known memory-usage regression when `react-native-worklets` / `react-native-reanimated` are imported — SDK 57 is the fix. Worth scheduling once the app has broader real-device testing, not urgent before that.

## 3. Push notifications — gap vs. the cahier des charges

§4.3 explicitly requires "Notifications (email, push mobile)". `apps/mobile/lib/notifications.ts` only talks to the backend's in-app/email notification endpoints (`/notifications/*`) — there is no `expo-notifications` dependency, no push-token registration, and no Expo push service wiring. Email + in-app notifications exist; **mobile push does not yet**.

**To close this**: add `expo-notifications` + `expo-device`, register the Expo push token on sign-in (store it server-side against the user), and send through Expo's push API from the API when a notification is created. This is a real feature gap, not a style nit — flagging it because it's an explicit spec requirement.

## 4. EAS Build/Submit pipeline — ✅ scaffolded, needs your credentials

`apps/mobile/eas.json` now exists with `development` / `preview` / `production` build profiles, plus a `submit.production` profile for both stores. `eas-cli@23.2.0` is pinned as a devDependency (so the whole team/CI uses the same version via `pnpm exec eas ...` instead of a global install), and `app.json` got a `runtimeVersion: { policy: "appVersion" }` so builds and future OTA updates stay compatible. New scripts: `pnpm --filter @carpool/mobile build:dev|build:preview|build:production` and `submit:production`.

**Still needs a human with account access — I did not run any of this, since it creates cloud resources under your identity**:
1. `pnpm exec eas login` (your Expo account) then `pnpm exec eas init` from `apps/mobile` — this creates the EAS project and writes `extra.eas.projectId` into `app.json` for you.
2. `pnpm exec eas update:configure` once `eas init` is done, to wire up `updates.url` for OTA updates.
3. Android: create a Google Play Console app entry + a service-account key, referenced from `eas.json`'s `submit.production.android` (currently ships as `track: "internal"` / `releaseStatus: "draft"` — deliberately conservative first submission, promote to `production` once you're ready). Requires the one-time $25 Play Developer fee if not already registered.
4. iOS: fill in `submit.production.ios.appleTeamId` in `eas.json` (currently empty) — requires an active Apple Developer Program membership. `eas submit` lands the build in TestFlight; promoting to a public release is still a manual step in App Store Connect (metadata, screenshots, submit for review).
5. Android production builds must ship as `.aab` (Play Console requirement) — the `production` profile already defaults to that; only `preview` is forced to `.apk` for easier internal sideloading.
6. Once step 1–2 are done, **`EAS Update`** is worth turning on for JS-only fixes — it covers most of §10's "maintenance corrective" without a full store re-submission. Native-module changes (new packages, permission changes) still require a full build + store review.

## 5. Store privacy compliance — ties directly to §7 (PIPEDA / Loi 25)

Both stores now enforce this at review time, not just as a policy formality:
- **Apple**: App Privacy "nutrition label" in App Store Connect must accurately list data collected (location, payment info, identity documents, messages) and whether it's linked to the user — this has to match what `Privacy` copy already describes in `apps/web/messages/*.json`, not be filled in generically.
- **Google Play**: the Data Safety section has the equivalent requirement.
- **Background location**: the app already has a driver-side live-location-share feature (`apps/web/src/hooks/use-live-location-share.ts`, mirrored by `apps/mobile/lib/tracking.ts`). Both stores scrutinize background-location permission requests closely in 2026 — the in-app permission prompt and the store privacy disclosure need to say the same thing ("shared with confirmed passengers only, during an active trip"), or review gets rejected/delayed.
- This is the mobile-side twin of what `docs/requirements-specification-audit.md` already flagged as PIPEDA compliance being the weakest area (40% at audit time, `main`-scoped) — the mobile app inherits that gap and should not be treated as a separate compliance surface.

## 6. Already following current best practice — no action needed

- **Token storage**: `apps/mobile/lib/auth-client.ts` uses `@better-auth/expo` with `expo-secure-store` (Keychain/Keystore-backed) for session storage, not `AsyncStorage`. This is exactly the current recommendation — plaintext `AsyncStorage` for auth tokens is the most common mistake in this ecosystem and this project already avoids it.
- **New Architecture**: `app.json` has `"newArchEnabled": true`, matching SDK 56's mandatory default.
- **Monorepo code-sharing**: `@carpool/schemas` and `@carpool/api-client` are shared between `apps/web` and `apps/mobile`, which is the right structure for keeping the two clients in sync as the API evolves — worth preserving as a hard rule for any new feature (add the type/schema once in `packages/schemas`, not per-app).

## 7. Testing — not yet covered

Nothing under `apps/mobile` currently runs E2E tests against the New Architecture build. For a payments + live-location app, **Maestro** (simpler YAML flows, good New Architecture support, no need for a full Detox native rebuild per change) is the more current recommendation over Detox for a small team; worth scoping into the "Tests & corrections" phase (§11, 4 weeks budgeted) rather than deferring to post-launch.

---

## Priority summary

| Item | Effort | Status |
|---|---|---|
| Pin `react-native-worklets` version | Small | ✅ Done |
| `eas.json` + EAS Submit scaffolding | Medium | ✅ Config done — needs your `eas login` / `eas init` / store credentials |
| Add `expo-notifications` (push) | Medium | Open — explicit cahier des charges requirement, currently missing |
| Align store privacy labels with in-app disclosures | Small–Medium | Open — store review blocker, closes part of the PIPEDA/Loi 25 gap |
| Maestro E2E on core flows (booking, payment, live tracking) | Medium | Open — no mobile test coverage today |
| SDK 57 upgrade | Small, not urgent | Open |

---

## Sources

- [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56)
- [React Native's New Architecture — Expo Docs](https://docs.expo.dev/guides/new-architecture/)
- [React Native Reanimated — Compatibility table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/)
- [Reanimated/worklets version mismatch discussion (Expo SDK 54/56)](https://github.com/software-mansion/react-native-reanimated/discussions/8778)
- [Submit to Google Play with EAS Submit — Expo Docs](https://docs.expo.dev/submit/android/)
- [Submit to app stores — Expo Docs](https://docs.expo.dev/submit/introduction/)
- [Authentication in Expo and React Native apps — Expo Docs](https://docs.expo.dev/develop/authentication/)
- [Secure Token Storage in Expo: SecureStore vs AsyncStorage](https://dhairyasenjaliya.com/blog/secure-token-storage-in-expo-securestore-vs-asyncstorage)
- [Better Auth — Expo integration](https://better-auth.com/docs/integrations/expo)
- [App Review Guidelines — Apple Developer](https://developer.apple.com/app-store/review/guidelines/)
- [iOS App Store Review Guidelines 2026](https://appfollow.io/blog/app-store-review-guidelines)
