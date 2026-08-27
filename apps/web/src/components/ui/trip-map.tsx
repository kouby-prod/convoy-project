'use client';

import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

export interface TripMapPin {
  /** React key — unique per pin, e.g. "departure"/"arrival"/"live". */
  id: string;
  lat: number;
  lng: number;
  color: 'blue' | 'green' | 'yellow';
  /** 'live' renders a small pulsing dot instead of the static teardrop pin — for a moving driver position. */
  kind?: 'pin' | 'live';
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
}

interface TripMapProps {
  pins: TripMapPin[];
  className?: string;
  zoom?: number;
  /**
   * When true, the map only re-fits its view when the *set* of pin ids
   * changes — not on every position update for an already-known id. Use this
   * for a live-updating pin (e.g. a driver's moving position): without it,
   * the view would re-fit on every ping and fight anyone trying to pan/zoom.
   * Defaults to false, matching the original behavior (re-fit on every pins
   * change) used by the departure/arrival map and the draggable picker pin.
   */
  preserveViewOnUpdate?: boolean;
}

/**
 * Small Leaflet + OSM-tiles map, shared by `LocationPicker` (one draggable
 * preview pin) and `TrajetDetail` (two static pins, departure + arrival).
 * Loaded with `ssr: false` — Leaflet touches `window` at module scope and
 * would crash during server rendering.
 */
const TripMapInner = dynamic(() => import('./trip-map-inner'), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse rounded-md bg-muted" />,
});

export function TripMap({ pins, className, zoom, preserveViewOnUpdate }: TripMapProps) {
  if (pins.length === 0) return null;

  return (
    <div className={cn('overflow-hidden rounded-md ring-1 ring-border', className)}>
      <TripMapInner
        pins={pins}
        zoom={zoom}
        className="size-full"
        preserveViewOnUpdate={preserveViewOnUpdate}
      />
    </div>
  );
}
