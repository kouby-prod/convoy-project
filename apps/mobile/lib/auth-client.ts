import { createAuthClient } from 'better-auth/react';
import { phoneNumberClient } from 'better-auth/client/plugins';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { env } from './env';

/**
 * BetterAuth client for the mobile app — mirrors `apps/web/src/lib/auth-client.ts`
 * but swaps the browser cookie jar (`credentials: 'include'`) for `expoClient`,
 * which persists the session in SecureStore and attaches it to every
 * `better-auth/react` request itself. `phoneNumberClient` is only registered
 * to type the session's `phoneNumber` field (read on the account screen) —
 * there's no OTP UI on mobile yet, same as the web.
 */
export const authClient = createAuthClient({
  baseURL: env.EXPO_PUBLIC_API_URL,
  plugins: [
    phoneNumberClient(),
    // `expoClient`'s plugin type doesn't structurally satisfy
    // `better-auth/react`'s `BetterAuthClientPlugin` generic (upstream typing
    // friction between `@better-auth/expo` and `better-auth`'s client
    // generics) — the runtime shape (session actions + `getCookie`) is
    // correct; only the compile-time constraint check is overly strict.
    // @ts-expect-error — see above
    expoClient({
      scheme: 'carpool',
      storagePrefix: 'carpool',
      storage: SecureStore,
    }),
  ],
});
