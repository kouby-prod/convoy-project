'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchVapidPublicKey, subscribeWebPush, unsubscribeWebPush } from '@/lib/notifications';

/** VAPID keys are base64url — `PushManager.subscribe` wants a raw `Uint8Array` backed by a plain `ArrayBuffer`. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function subscriptionToJson(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Browser returned an incomplete push subscription');
  }
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}

export type WebPushStatus = 'unsupported' | 'checking' | 'subscribed' | 'unsubscribed';

/**
 * Manages this browser's Web Push subscription: service worker registration,
 * the native permission prompt, and syncing the resulting subscription with
 * the API. Independent from the `pushEnabled` account preference — that flag
 * says whether the account *wants* push at all, this hook is what actually
 * makes one browser a delivery target for it.
 */
export function useWebPush() {
  const [status, setStatus] = useState<WebPushStatus>('checking');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    if (!supported) {
      setStatus('unsupported');
      return;
    }
    let cancelled = false;
    navigator.serviceWorker
      .getRegistration('/sw.js')
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setStatus(subscription ? 'subscribed' : 'unsubscribed');
      })
      .catch(() => {
        if (!cancelled) setStatus('unsubscribed');
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      const publicKey = await fetchVapidPublicKey();
      if (!publicKey) throw new Error('push-not-configured');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('permission-denied');

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await subscribeWebPush(subscriptionToJson(subscription));
      setStatus('subscribed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'subscribe-failed');
      setStatus('unsubscribed');
    } finally {
      setIsPending(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeWebPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus('unsubscribed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unsubscribe-failed');
    } finally {
      setIsPending(false);
    }
  }, []);

  return { status, isPending, error, subscribe, unsubscribe };
}
