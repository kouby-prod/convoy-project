'use client';

import { useEffect, useState } from 'react';
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

  function handleInputBlur() {
    const t = text.trim();
    if (!t) return;
    // Accept HH:MM
    const parts = t.split(':');
    if (parts.length === 2) {
      const h = parseInt(parts[0]!, 10);
      const m = parseInt(parts[1]!, 10);
      if (!Number.isNaN(h) && !Number.isNaN(m) && h >= 0 && h < 24 && m >= 0 && m < 60) {
        setHour(h);
        setMinute(m);
        setText('');
      }
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i).filter((m) => m % 5 === 0);

  return (
    <div className={className}>
      <Input
        name="time"
        placeholder={ariaLabel ?? 'HH:MM'}
        value={text || `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleInputBlur}
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          aria-label="Heure"
          value={hour}
          onChange={(e) => setHour(parseInt(e.target.value, 10))}
          className="rounded-md border px-2 py-2 text-sm"
        >
          {hours.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}
            </option>
          ))}
        </select>

        <select
          aria-label="Minute"
          value={minute}
          onChange={(e) => setMinute(parseInt(e.target.value, 10))}
          className="rounded-md border px-2 py-2 text-sm"
        >
          {minutes.map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, '0')}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
