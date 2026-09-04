import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { PushPlatform } from '@carpool/schemas';
import { api } from './api-client';

/** Foreground notifications still show a banner/sound — RootLayout already syncs the badge via the WS, so this doesn't duplicate that. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerPushToken(token: string, platform: PushPlatform): Promise<void> {
  const res = await api.notifications['push-token'].$post({ json: { token, platform } });
  if (!res.ok) throw new Error('Failed to register the push token');
}

/** Called on sign-out so a shared/reused device stops receiving the previous account's push notifications. */
export async function unregisterCurrentPushToken(): Promise<void> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId || !Device.isDevice) return;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.notifications['push-token'].unregister.$post({ json: { token } });
  } catch {
    // Best-effort — a stale token just goes unused server-side (see push.ts).
  }
}

/**
 * Requests notification permission and registers this device's Expo push
 * token with the API. No-ops on a simulator/emulator (Expo can't issue a
 * push token there) and before `eas init` has populated
 * `extra.eas.projectId` in app.json — see docs/mobile-best-practices-2026.md.
 * Safe to call on every authenticated app start: registration is an upsert
 * keyed by the token itself.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    console.warn('[push] No EAS projectId in app.json yet — run `eas init` to enable push notifications.');
    return;
  }
  if (!Device.isDevice) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch (err) {
    console.error('[push] Failed to register for push notifications', err);
  }
}
