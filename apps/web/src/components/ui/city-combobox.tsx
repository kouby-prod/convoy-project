'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { filterCities } from '@/lib/cities';
import { cn } from '@/lib/utils';

interface CityComboboxProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Text input with a filtered city suggestion list (free text still allowed). */
export function CityCombobox({
  id,
  name,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  className,
  'aria-label': ariaLabel,
}: CityComboboxProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const suggestions = filterCities(value);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

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

  function selectCity(city: string) {
    onChange(city);
    setOpen(false);
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
      selectCity(suggestions[highlight]!);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
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
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-11 w-full rounded-md bg-card py-2 pl-10 pr-4 text-sm text-foreground shadow-sm ring-1 ring-border outline-none transition-all duration-200',
            'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      </div>

      {open && suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-56 overflow-auto rounded-md bg-popover py-1 text-popover-foreground shadow-xl ring-1 ring-foreground/10"
        >
          {suggestions.map((city, index) => (
            <li key={city} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none transition-colors',
                  index === highlight ? 'bg-muted text-foreground' : 'hover:bg-muted/70',
                )}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => selectCity(city)}
              >
                <MapPin className="size-3.5 shrink-0 text-brand-blue" strokeWidth={2.25} />
                {city}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
