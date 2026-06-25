'use client';

import { type FocusEvent, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

interface DropdownDatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder?: string;
  className?: string;
}

export function DropdownDatePicker({ value, onChange, placeholder, className }: DropdownDatePickerProps) {
  const now = new Date();
  const initial = value ?? now;
  const [day, setDay] = useState<number>(initial.getDate());
  const [month, setMonth] = useState<number>(initial.getMonth());
  const [year, setYear] = useState<number>(initial.getFullYear());
  const [text, setText] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (value) {
      setDay(value.getDate());
      setMonth(value.getMonth());
      setYear(value.getFullYear());
      setText('');
    }
  }, [value]);

  useEffect(() => {
    const maxDay = new Date(year, month + 1, 0).getDate();
    const d = Math.min(day, maxDay);
    onChange(new Date(year, month, d));
  }, [day, month, year]);

  function parseTextValue(value: string) {
    const normalized = value.trim();
    if (!normalized) return null;

    const partsSlash = normalized.split('/');
    const partsDash = normalized.split('-');
    let parsed: Date | null = null;

    if (partsSlash.length === 3) {
      const p1 = parseInt(partsSlash[0]!, 10);
      const p2 = parseInt(partsSlash[1]!, 10);
      const p3 = parseInt(partsSlash[2]!, 10);
      if (!Number.isNaN(p1) && !Number.isNaN(p2) && !Number.isNaN(p3)) {
        parsed = new Date(p3, p2 - 1, p1);
      }
    } else if (partsDash.length === 3) {
      const a = parseInt(partsDash[0]!, 10);
      const b = parseInt(partsDash[1]!, 10);
      const c = parseInt(partsDash[2]!, 10);
      if (!Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(c)) {
        if (a > 31) {
          parsed = new Date(a, b - 1, c);
        } else {
          parsed = new Date(c, b - 1, a);
        }
      }
    }

    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  function handleInputBlur() {
    const parsed = parseTextValue(text);
    if (parsed) {
      setDay(parsed.getDate());
      setMonth(parsed.getMonth());
      setYear(parsed.getFullYear());
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

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i);
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear + i);

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
          name="date"
          placeholder={placeholder ?? 'JJ/MM/AAAA'}
          value={text || `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleInputBlur}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
        />

        {isOpen && (
          <div className="absolute left-0 right-0 z-10 mt-2 rounded-xl border border-border bg-popover p-3 shadow-lg">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Jour</label>
                <select
                  aria-label="Jour"
                  value={day}
                  onChange={(e) => setDay(parseInt(e.target.value, 10))}
                  className="w-full rounded-md border px-2 py-2 text-sm"
                >
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {String(d).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Mois</label>
                <select
                  aria-label="Mois"
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                  className="w-full rounded-md border px-2 py-2 text-sm"
                >
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {String(m + 1).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Année</label>
                <select
                  aria-label="Année"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value, 10))}
                  className="w-full rounded-md border px-2 py-2 text-sm"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
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
