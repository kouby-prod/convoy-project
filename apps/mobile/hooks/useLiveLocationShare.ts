import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { updateLiveLocation, stopLiveLocation } from '@/lib/tracking';

export type LiveLocationShareStatus = 'idle' | 'requesting' | 'sharing' | 'error';
export type LiveLocationShareError = 'unsupported' | 'permission-denied' | 'send-failed' | null;

/** Minimum time between pings to the API — matches the web hook's throttle. */
const MIN_SEND_INTERVAL_MS = 8_000;

/**
 * Driver-side live location sharing for one trajet — mobile counterpart of
 * the web's `useLiveLocationShare`. Wraps `expo-location`'s
 * `watchPositionAsync` (foreground permission only — works in Expo Go, no
 * dev build needed), throttles updates to `POST /trajets/:id/location`, and
 * stops sharing (both the watch and the server-side record, via
 * `DELETE /trajets/:id/location`) on explicit stop or unmount.
 */
export function useLiveLocationShare(trajetId: string) {
  const [status, setStatus] = useState<LiveLocationShareStatus>('idle');
  const [error, setError] = useState<LiveLocationShareError>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastSentAtRef = useRef(0);
  const sharingRef = useRef(false);
  // Flipped by stop()/unmount so a start() still awaiting the permission
  // prompt or watchPositionAsync's setup can tell it's no longer wanted and
  // must remove whatever subscription it gets instead of storing it — without
  // this, calling stop() (or unmounting) while start() is still in flight
  // left a live GPS watch running with nothing left to stop it.
  const cancelledRef = useRef(false);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    const wasSharing = sharingRef.current;
    sharingRef.current = false;
    setStatus('idle');
    if (wasSharing) {
      void stopLiveLocation(trajetId).catch(() => {
        // Best-effort — the server-side position also expires on its own TTL.
      });
    }
  }, [trajetId]);

  const start = useCallback(async () => {
    cancelledRef.current = false;
    setStatus('requesting');
    setError(null);

    const { status: permission } = await Location.requestForegroundPermissionsAsync();
    if (cancelledRef.current) return;
    if (permission !== 'granted') {
      setError('permission-denied');
      setStatus('error');
      return;
    }

    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: MIN_SEND_INTERVAL_MS, distanceInterval: 10 },
      (position) => {
        sharingRef.current = true;
        setStatus('sharing');
        setError(null);

        const now = Date.now();
        if (now - lastSentAtRef.current < MIN_SEND_INTERVAL_MS) return;
        lastSentAtRef.current = now;

        const { latitude, longitude, heading, speed } = position.coords;
        void updateLiveLocation(trajetId, {
          lat: latitude,
          lng: longitude,
          heading: heading != null && heading >= 0 ? heading : null,
          speed: speed != null && speed >= 0 ? speed : null,
        }).catch(() => {
          setError('send-failed');
        });
      },
    );

    if (cancelledRef.current) {
      subscription.remove();
      return;
    }
    subscriptionRef.current = subscription;
  }, [trajetId]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      subscriptionRef.current?.remove();
      if (sharingRef.current) {
        void stopLiveLocation(trajetId).catch(() => {
          // Best-effort on unmount too.
        });
      }
    };
  }, [trajetId]);

  return { status, error, start, stop, isSharing: status === 'sharing' };
}
