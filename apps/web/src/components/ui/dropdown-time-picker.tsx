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

function formatTime(value: TimeValue) {
  return `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
}

export function DropdownTimePicker({ value, onChange, ariaLabel, className }: DropdownTimePickerProps) {
  const initial = value ?? DEFAULT_TIME;
  const [timeValue, setTimeValue] = useState<string>(formatTime(initial));

  useEffect(() => {
    if (value) {
      setTimeValue(formatTime(value));
    }
  }, [value]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextTime = event.target.value;
    setTimeValue(nextTime);

    const [hourString, minuteString] = nextTime.split(':');
    const hour = Number(hourString);
    const minute = Number(minuteString);

    if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
      onChange({ hour, minute });
    }
  }

  return (
    <div className={className}>
      <Input
        type="time"
        aria-label={ariaLabel ?? 'Select time'}
        value={timeValue}
        onChange={handleChange}
        className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
      />
    </div>
  );
}
