'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LocateFixed, Loader2, MapPin } from 'lucide-react';
import type { GeocodeResult } from '@carpool/schemas';
import { searchPlaces, reverseGeocode } from '@/lib/geocode';
import { cn } from '@/lib/utils';
import { TripMap } from './trip-map';

export interface LocationValue {
  city: string;
  lat: number | null;
  lng: number | null;
}

interface LocationPickerProps {
  id?: string;
  name?: string;
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  /** Accessible label for the icon-only "use my location" button. */
  useMyLocationLabel: string;
  /** Shown when the browser denies/fails a "use my location" request. */
  locationErrorLabel: string;
  /** Pin/marker color — lets departure and arrival read apart on the map. */
  mapColor: 'blue' | 'green';
}

const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;

/**
 * Address search + "use my location" + a small draggable-marker map preview,
 * for the departure/arrival fields on the ride-creation form. A strict
 * superset of `CityCombobox`'s free-text behavior: typing without ever
 * picking a suggestion still produces a valid (coordinate-less) value.
 */
export function LocationPicker({
  id,
  name,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  className,
  'aria-label': ariaLabel,
  useMyLocationLabel,
  locationErrorLabel,
  mapColor,
}: LocationPickerProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    setHighlight(0);
  }, [suggestions, open]);

  // Debounced search-as-you-type — skipped once a suggestion (or "use my
  // location") already resolved this exact text, so re-opening the listbox
  // on focus doesn't immediately re-fire a redundant request.
  useEffect(() => {
    const query = value.city.trim();
    if (!open || query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(query)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value.city, open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  function selectSuggestion(result: GeocodeResult) {
    onChange({ city: result.label, lat: result.lat, lng: result.lng });
    setOpen(false);
  }

  function handleTextChange(city: string) {
    // Free-text edits invalidate whatever point was previously picked — a
    // stale coordinate that no longer matches the typed text would be worse
    // than no coordinate at all.
    onChange({ city, lat: null, lng: null });
    setOpen(true);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && suggestions[highlight]) {
      event.preventDefault();
      selectSuggestion(suggestions[highlight]!);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }
    setLocationError(false);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        reverseGeocode(latitude, longitude)
          .then((label) => {
            onChange({ city: label ?? value.city, lat: latitude, lng: longitude });
          })
          .finally(() => setLocating(false));
      },
      () => {
        setLocationError(true);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function handleMarkerDragEnd(lat: number, lng: number) {
    onChange({ city: value.city, lat, lng });
  }

  return (
    <div ref={containerRef} className={cn('flex flex-col gap-2', className)}>
      <div className="relative">
        <div className="relative">
          <MapPin
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2.25}
            aria-hidden
          />
          <input
            id={id}
            name={name}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-label={ariaLabel}
            autoComplete="off"
            required={required}
            disabled={disabled}
            value={value.city}
            placeholder={placeholder}
            onChange={(event) => handleTextChange(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className={cn(
              'h-11 w-full rounded-md bg-card py-2 pr-11 pl-10 text-sm text-foreground shadow-sm ring-1 ring-border outline-none transition-all duration-200',
              'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          />
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={disabled || locating}
            aria-label={useMyLocationLabel}
            title={useMyLocationLabel}
            className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-50"
          >
            {locating ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2.25} aria-hidden />
            ) : (
              <LocateFixed className="size-4" strokeWidth={2.25} aria-hidden />
            )}
          </button>
        </div>

        {open && (suggestions.length > 0 || searching) ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-56 overflow-auto rounded-md bg-popover py-1 text-popover-foreground shadow-xl ring-1 ring-foreground/10"
          >
            {searching && suggestions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">…</li>
            ) : null}
            {suggestions.map((result, index) => (
              <li key={`${result.lat}-${result.lng}`} role="option" aria-selected={index === highlight}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-2 text-left text-sm outline-none transition-colors',
                    index === highlight ? 'bg-muted text-foreground' : 'hover:bg-muted/70',
                  )}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => selectSuggestion(result)}
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-blue" strokeWidth={2.25} aria-hidden />
                  {result.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {locationError ? <p className="text-xs text-destructive">{locationErrorLabel}</p> : null}

      {value.lat !== null && value.lng !== null ? (
        <TripMap
          pins={[
            {
              id: 'picker',
              lat: value.lat,
              lng: value.lng,
              color: mapColor,
              draggable: true,
              onDragEnd: handleMarkerDragEnd,
            },
          ]}
          className="h-40"
        />
      ) : null}
    </div>
  );
}
