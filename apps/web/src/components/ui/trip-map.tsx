'use client';

import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

export interface TripMapPin {
  /** React key — unique per pin, e.g. "departure"/"arrival". */
  id: string;
  lat: number;
  lng: number;
  color: 'blue' | 'green';
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
}

interface TripMapProps {
  pins: TripMapPin[];
  className?: string;
  zoom?: number;
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

export function TripMap({ pins, className, zoom }: TripMapProps) {
  if (pins.length === 0) return null;

  return (
    <div className={cn('overflow-hidden rounded-md ring-1 ring-border', className)}>
      <TripMapInner pins={pins} zoom={zoom} className="size-full" />
    </div>
  );
}
