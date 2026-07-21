'use client';

import { type KeyboardEvent, useRef } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimeValue {
  /** 24-hour clock: 0–23. */
  hour: number;
  /** 0–59. */
  minute: number;
}

/** Sensible default shown before the user edits: 00:00. */
export const DEFAULT_TIME: TimeValue = { hour: 0, minute: 0 };

export function formatTime({ hour, minute }: TimeValue) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

interface TimePickerProps {
  value: TimeValue;
  onChange: (value: TimeValue) => void;
  ariaLabel: string;
  className?: string;
}

/* Inline segmented time field (24h format) — no popover. Each segment is independently
   selectable: focus the hour/minute and adjust with arrow keys, the scroll
   wheel, or by typing digits. Styled like Input. */
export function TimePicker({ value, onChange, ariaLabel, className }: TimePickerProps) {
  // Shared digit-typing buffer (e.g. "1" then "2" → 12). Reset on segment change.
  const typingBufferRef = useRef('');
  const bufferResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleBufferReset() {
    if (bufferResetRef.current) clearTimeout(bufferResetRef.current);
    bufferResetRef.current = setTimeout(() => {
      typingBufferRef.current = '';
    }, 1200);
  }

  function changeHour(delta: number) {
    onChange({ ...value, hour: (value.hour + delta + 24) % 24 });
  }

  function changeMinute(delta: number) {
    onChange({ ...value, minute: (value.minute + delta + 60) % 60 });
  }

  function typeHour(digit: string) {
    const asTwoDigits = Number.parseInt((typingBufferRef.current + digit).slice(-2), 10);
    if (asTwoDigits >= 0 && asTwoDigits <= 23) {
      onChange({ ...value, hour: asTwoDigits });
      typingBufferRef.current = (typingBufferRef.current + digit).slice(-2);
    } else {
      const asOneDigit = Number.parseInt(digit, 10);
      if (asOneDigit >= 0 && asOneDigit <= 9) onChange({ ...value, hour: asOneDigit });
      typingBufferRef.current = digit;
    }
    scheduleBufferReset();
  }

  function typeMinute(digit: string) {
    const asTwoDigits = Number.parseInt((typingBufferRef.current + digit).slice(-2), 10);
    if (asTwoDigits <= 59) {
      onChange({ ...value, minute: asTwoDigits });
      typingBufferRef.current = (typingBufferRef.current + digit).slice(-2);
    } else {
      onChange({ ...value, minute: Number.parseInt(digit, 10) });
      typingBufferRef.current = digit;
    }
    scheduleBufferReset();
  }

  function handleNumericKey(
    event: KeyboardEvent<HTMLButtonElement>,
    step: (delta: number) => void,
    type: (digit: string) => void,
  ) {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      step(-1);
    } else if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      type(event.key);
    }
  }

  const segmentClass =
    'rounded-xl px-1.5 tabular-nums outline-none transition-all duration-200 hover:bg-muted focus:bg-accent focus:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/30';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'flex h-12 w-full items-center gap-1 rounded-full bg-card px-5 text-sm text-foreground shadow-sm ring-1 ring-border',
        className,
      )}
    >
      <Clock className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
      <div className="flex flex-1 items-center justify-center gap-0.5 font-medium">
        <button
          type="button"
          role="spinbutton"
          aria-label="Hour"
          aria-valuenow={value.hour}
          aria-valuemin={0}
          aria-valuemax={23}
          onFocus={() => (typingBufferRef.current = '')}
          onWheel={(event) => {
            if (document.activeElement === event.currentTarget) changeHour(event.deltaY < 0 ? 1 : -1);
          }}
          onKeyDown={(event) => handleNumericKey(event, changeHour, typeHour)}
          className={segmentClass}
        >
          {String(value.hour).padStart(2, '0')}
        </button>
        <span className="text-muted-foreground">:</span>
        <button
          type="button"
          role="spinbutton"
          aria-label="Minute"
          aria-valuenow={value.minute}
          aria-valuemin={0}
          aria-valuemax={59}
          onFocus={() => (typingBufferRef.current = '')}
          onWheel={(event) => {
            if (document.activeElement === event.currentTarget)
              changeMinute(event.deltaY < 0 ? 1 : -1);
          }}
          onKeyDown={(event) => handleNumericKey(event, changeMinute, typeMinute)}
          className={segmentClass}
        >
          {String(value.minute).padStart(2, '0')}
        </button>
      </div>
    </div>
  );
}
