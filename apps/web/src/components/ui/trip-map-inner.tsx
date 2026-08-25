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
};

function pinIcon(color: TripMapPin['color']): L.DivIcon {
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

/** Recenters/fits the map whenever the pin set changes — panning is otherwise frozen at the initial view. */
function FitToPins({ pins }: { pins: TripMapPin[] }) {
  const map = useMap();
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
  }, [map, pins]);
  return null;
}

interface TripMapInnerProps {
  pins: TripMapPin[];
  className?: string;
  zoom?: number;
}

export default function TripMapInner({ pins, className, zoom = 13 }: TripMapInnerProps) {
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
        <FitToPins pins={pins} />
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            icon={pinIcon(pin.color)}
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
