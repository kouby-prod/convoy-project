'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { TripMapPin } from './trip-map';

/**
 * Real Leaflet implementation — only ever loaded client-side (see
 * `trip-map.tsx`'s `next/dynamic(..., { ssr: false })`), since Leaflet reads
 * `window`/`document` at module scope and would crash during SSR.
 *
 * Markers use an inline-SVG `divIcon` rather than Leaflet's default marker
 * image (the classic broken-icon-path issue under bundlers that don't serve
 * Leaflet's `images/` folder verbatim) — hex colors are hardcoded to this
 * app's `--brand-blue`/`--brand-green` tokens (apps/web/src/app/globals.css)
 * since a `divIcon`'s `html` string is raw HTML, not JSX, so Tailwind's
 * static class scanner never sees classes embedded in it.
 */
const PIN_COLORS: Record<TripMapPin['color'], string> = {
  blue: '#187eb3',
  green: '#26b053',
  yellow: '#e2d200',
};

function teardropIcon(color: TripMapPin['color']): L.DivIcon {
  const fill = PIN_COLORS[color];
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${fill}" stroke="white" stroke-width="1.5">
      <path d="M12 22s7-7.58 7-12.5A7 7 0 0 0 5 9.5C5 14.42 12 22 12 22Z"/>
      <circle cx="12" cy="9.5" r="2.5" fill="white" stroke="none"/>
    </svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

/**
 * Pulsing dot for a live (moving) position — plain SVG `<animate>` (SMIL)
 * rather than a Tailwind animation class: a `divIcon`'s `html` is raw HTML,
 * not JSX, so Tailwind's static class scanner never sees classes embedded in
 * it (see the module doc above). SMIL needs no framework and works in every
 * evergreen browser this app targets.
 */
function liveIcon(color: TripMapPin['color']): L.DivIcon {
  const fill = PIN_COLORS[color];
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
      <circle cx="13" cy="13" r="8" fill="${fill}" fill-opacity="0.35">
        <animate attributeName="r" values="8;12;8" dur="2s" repeatCount="indefinite" />
        <animate attributeName="fill-opacity" values="0.35;0.05;0.35" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="13" cy="13" r="6" fill="${fill}" stroke="white" stroke-width="2"/>
    </svg>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Only 3 colors × 2 kinds (6 total) ever exist, but a live pin's position
 * ticks every ~8-10s and each tick is a new pin object — without this cache,
 * `pinIcon` reallocated a fresh `L.DivIcon` (including a fresh SVG string)
 * for the moving marker on every single ping.
 */
const iconCache = new Map<string, L.DivIcon>();

function pinIcon(pin: Pick<TripMapPin, 'color' | 'kind'>): L.DivIcon {
  const key = `${pin.kind ?? 'default'}:${pin.color}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const icon = pin.kind === 'live' ? liveIcon(pin.color) : teardropIcon(pin.color);
  iconCache.set(key, icon);
  return icon;
}

/**
 * A single dependency string for `FitToPins`' effect. In the normal case it
 * encodes every pin's id + position, so any move re-fits the view (departure/
 * arrival map, the draggable picker pin). In `preserveViewOnUpdate` mode it
 * only encodes the *set* of ids, so a live pin's position ticking every few
 * seconds does not keep fighting a passenger's manual pan/zoom — the view
 * only re-fits when a pin actually appears or disappears.
 */
function fitKeyFor(pins: TripMapPin[], preserveViewOnUpdate: boolean): string {
  if (preserveViewOnUpdate) {
    return pins
      .map((pin) => pin.id)
      .sort()
      .join(',');
  }
  return pins.map((pin) => `${pin.id}:${pin.lat}:${pin.lng}`).join(',');
}

/** Recenters/fits the map when `fitKey` changes — panning is otherwise frozen at the initial view. */
function FitToPins({ pins, preserveViewOnUpdate }: { pins: TripMapPin[]; preserveViewOnUpdate: boolean }) {
  const map = useMap();
  const fitKey = fitKeyFor(pins, preserveViewOnUpdate);
  useEffect(() => {
    if (pins.length === 0) return;
    if (pins.length === 1) {
      map.setView([pins[0]!.lat, pins[0]!.lng], map.getZoom() < 4 ? 13 : map.getZoom());
      return;
    }
    map.fitBounds(
      pins.map((pin) => [pin.lat, pin.lng] as [number, number]),
      { padding: [32, 32] },
    );
    // Deliberately keyed on `fitKey`, not `pins` — see `fitKeyFor` above.
  }, [map, fitKey]);
  return null;
}

interface TripMapInnerProps {
  pins: TripMapPin[];
  className?: string;
  zoom?: number;
  preserveViewOnUpdate?: boolean;
}

export default function TripMapInner({
  pins,
  className,
  zoom = 13,
  preserveViewOnUpdate = false,
}: TripMapInnerProps) {
  const first = pins[0];

  if (!first) return null;

  return (
    <div className={className}>
      <MapContainer
        center={[first.lat, first.lng]}
        zoom={zoom}
        scrollWheelZoom={false}
        className="size-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToPins pins={pins} preserveViewOnUpdate={preserveViewOnUpdate} />
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            icon={pinIcon(pin)}
            draggable={pin.draggable ?? false}
            eventHandlers={
              pin.onDragEnd
                ? {
                    dragend: (event) => {
                      const marker = event.target as L.Marker;
                      const { lat, lng } = marker.getLatLng();
                      pin.onDragEnd?.(lat, lng);
                    },
                  }
                : undefined
            }
          />
        ))}
      </MapContainer>
    </div>
  );
}
