'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { updateLiveLocation, stopLiveLocation } from '@/lib/tracking';

export type LiveLocationShareStatus = 'idle' | 'requesting' | 'sharing' | 'error';
export type LiveLocationShareError = 'unsupported' | 'permission-denied' | 'send-failed' | null;

/** Minimum time between pings to the API — `watchPosition` can fire far more often than this. */
const MIN_SEND_INTERVAL_MS = 8_000;

/**
 * Driver-side live location sharing for one trajet: wraps the browser's
 * Geolocation `watchPosition`, throttles updates to `POST /trajets/:id/location`,
 * and stops sharing (both the watch and the server-side record, via
 * `DELETE /trajets/:id/location`) on explicit stop or unmount.
 */
export function useLiveLocationShare(trajetId: string) {
  const [status, setStatus] = useState<LiveLocationShareStatus>('idle');
  const [error, setError] = useState<LiveLocationShareError>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);
  const sharingRef = useRef(false);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const wasSharing = sharingRef.current;
    sharingRef.current = false;
    setStatus('idle');
    if (wasSharing) {
      void stopLiveLocation(trajetId).catch(() => {
        // Best-effort — the server-side position also expires on its own TTL.
      });
    }
  }, [trajetId]);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('unsupported');
      setStatus('error');
      return;
    }

    setStatus('requesting');
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        sharingRef.current = true;
        setStatus('sharing');
        setError(null);

        const now = Date.now();
        if (now - lastSentAtRef.current < MIN_SEND_INTERVAL_MS) return;
        lastSentAtRef.current = now;

        // The Geolocation spec allows `heading`/`speed` to be a negative
        // sentinel (e.g. -1) when the device can't determine them — normalize
        // to `null` so `LiveLocation` has one platform-independent contract
        // (matches the mobile hook's own sanitization).
        const { heading, speed } = position.coords;
        void updateLiveLocation(trajetId, {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: heading != null && heading >= 0 ? heading : null,
          speed: speed != null && speed >= 0 ? speed : null,
        }).catch(() => {
          setError('send-failed');
        });
      },
      (geoError) => {
        setStatus('error');
        setError(geoError.code === geoError.PERMISSION_DENIED ? 'permission-denied' : 'send-failed');
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
  }, [trajetId]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (sharingRef.current) {
        void stopLiveLocation(trajetId).catch(() => {
          // Best-effort on unmount too.
        });
      }
    };
  }, [trajetId]);

  return { status, error, start, stop, isSharing: status === 'sharing' };
}
