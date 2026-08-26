'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseTime, type TimeValue } from '@/components/ui/time-picker';
import { cn } from '@/lib/utils';

interface DropdownTimePickerProps {
  id?: string;
  value?: TimeValue;
  onChange: (t: TimeValue) => void;
  ariaLabel?: string;
  className?: string;
  required?: boolean;
  invalid?: boolean;
}

function formatTime(value: TimeValue) {
  return `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
}

export function DropdownTimePicker({
  id,
  value,
  onChange,
  ariaLabel,
  className,
  required,
  invalid,
}: DropdownTimePickerProps) {
  const [timeValue, setTimeValue] = useState<string>(value ? formatTime(value) : '');

  useEffect(() => {
    setTimeValue(value ? formatTime(value) : '');
  }, [value]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextTime = event.target.value;
    setTimeValue(nextTime);
    const parsed = parseTime(nextTime);
    if (parsed) onChange(parsed);
  }

  return (
    <div className={className}>
      <Input
        id={id}
        type="time"
        aria-label={ariaLabel ?? 'Select time'}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid && id ? `${id}-error` : undefined}
        value={timeValue}
        onChange={handleChange}
        className={cn(
          'appearance-none [&::-webkit-calendar-picker-indicator]:opacity-60',
          invalid && 'ring-destructive focus-visible:ring-destructive/30',
        )}
      />
    </div>
  );
}
