'use client';

import { type FocusEvent, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { DEFAULT_TIME, type TimeValue } from '@/components/ui/time-picker';

interface DropdownTimePickerProps {
  value?: TimeValue;
  onChange: (t: TimeValue) => void;
  ariaLabel?: string;
  className?: string;
}

export function DropdownTimePicker({ value, onChange, ariaLabel, className }: DropdownTimePickerProps) {
  const initial = value ?? DEFAULT_TIME;
  const [hour, setHour] = useState<number>(initial.hour);
  const [minute, setMinute] = useState<number>(initial.minute);
  const [text, setText] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (value) {
      setHour(value.hour);
      setMinute(value.minute);
      setText('');
    }
  }, [value]);

  useEffect(() => {
    onChange({ hour, minute });
  }, [hour, minute]);

  function parseTextValue(value: string) {
    const normalized = value.trim();
    if (!normalized) return null;

    const parts = normalized.split(':');
    if (parts.length !== 2) return null;

    const h = parseInt(parts[0]!, 10);
    const m = parseInt(parts[1]!, 10);
    if (!Number.isNaN(h) && !Number.isNaN(m) && h >= 0 && h < 24 && m >= 0 && m < 60) {
      return { hour: h, minute: m };
    }

    return null;
  }

  function handleInputBlur() {
    const parsed = parseTextValue(text);
    if (parsed) {
      setHour(parsed.hour);
      setMinute(parsed.minute);
      setText('');
    }
  }

  function handleContainerFocus() {
    setIsOpen(true);
  }

  function handleContainerBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (wrapperRef.current?.contains(event.relatedTarget as Node)) {
      return;
    }
    setIsOpen(false);
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i).filter((m) => m % 5 === 0);

  return (
    <div className={className}>
      <div
        ref={wrapperRef}
        className="relative"
        onFocus={handleContainerFocus}
        onBlur={handleContainerBlur}
        tabIndex={-1}
      >
        <Input
          name="time"
          placeholder={ariaLabel ?? 'HH:MM'}
          value={text || `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleInputBlur}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
        />

        {isOpen && (
          <div className="absolute left-0 right-0 z-10 mt-2 rounded-xl border border-border bg-popover p-3 shadow-lg">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Heure</label>
                <select
                  aria-label="Heure"
                  value={hour}
                  onChange={(e) => setHour(parseInt(e.target.value, 10))}
                  className="w-full rounded-md border px-2 py-2 text-sm"
                >
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Minute</label>
                <select
                  aria-label="Minute"
                  value={minute}
                  onChange={(e) => setMinute(parseInt(e.target.value, 10))}
                  className="w-full rounded-md border px-2 py-2 text-sm"
                >
                  {minutes.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
