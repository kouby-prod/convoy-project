'use client';

import { useEffect, useState } from 'react';
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

  function handleInputBlur() {
    const normalized = text.trim();
    if (!normalized) return;

    // Accept dd/mm/yyyy or yyyy-mm-dd or dd-mm-yyyy
    const partsSlash = normalized.split('/');
    const partsDash = normalized.split('-');

    let parsed: Date | null = null;

    if (partsSlash.length === 3) {
      const p1 = parseInt(partsSlash[0]!, 10);
      const p2 = parseInt(partsSlash[1]!, 10);
      const p3 = parseInt(partsSlash[2]!, 10);
      if (!Number.isNaN(p1) && !Number.isNaN(p2) && !Number.isNaN(p3)) {
        // assume dd/mm/yyyy
        parsed = new Date(p3, p2 - 1, p1);
      }
    } else if (partsDash.length === 3) {
      const a = parseInt(partsDash[0]!, 10);
      const b = parseInt(partsDash[1]!, 10);
      const c = parseInt(partsDash[2]!, 10);
      if (!Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(c)) {
        // try yyyy-mm-dd or dd-mm-yyyy -> detect
        if (a > 31) {
          parsed = new Date(a, b - 1, c);
        } else {
          parsed = new Date(c, b - 1, a);
        }
      }
    }

    if (parsed && !Number.isNaN(parsed.getTime())) {
      setDay(parsed.getDate());
      setMonth(parsed.getMonth());
      setYear(parsed.getFullYear());
      setText('');
    }
  }

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i);
  const currentYear = now.getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear + i);

  return (
    <div className={className}>
      <Input
        name="date"
        placeholder={placeholder ?? 'JJ/MM/AAAA'}
        value={text || `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleInputBlur}
      />

      <div className="mt-2 grid grid-cols-3 gap-2">
        <select
          aria-label="Jour"
          value={day}
          onChange={(e) => setDay(parseInt(e.target.value, 10))}
          className="rounded-md border px-2 py-2 text-sm"
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          aria-label="Mois"
          value={month}
          onChange={(e) => setMonth(parseInt(e.target.value, 10))}
          className="rounded-md border px-2 py-2 text-sm"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {String(m + 1).padStart(2, '0')}
            </option>
          ))}
        </select>

        <select
          aria-label="Année"
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          className="rounded-md border px-2 py-2 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
