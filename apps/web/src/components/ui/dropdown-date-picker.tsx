'use client';

import { useId, useState } from 'react';
import { useLocale } from 'next-intl';
import { CalendarDays } from 'lucide-react';
import { Popover } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { fieldControlClassName } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function dateToParam(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function paramToDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

interface DropdownDatePickerProps {
  id?: string;
  value?: Date;
  onChange: (date: Date) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
  required?: boolean;
}

export function DropdownDatePicker({
  id,
  value,
  onChange,
  placeholder,
  className,
  'aria-label': ariaLabel,
  required,
}: DropdownDatePickerProps) {
  const locale = useLocale();
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const [isOpen, setIsOpen] = useState(false);

  const formattedDate = value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value)
    : '';

  return (
    <Popover
      open={isOpen}
      onOpenChange={setIsOpen}
      className={className}
      trigger={
        <button
          type="button"
          id={triggerId}
          aria-label={ariaLabel ?? placeholder}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-required={required || undefined}
          className={cn(fieldControlClassName, 'flex items-center justify-between gap-2 text-left font-normal')}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className={cn('truncate', !formattedDate && 'text-muted-foreground')}>
            {formattedDate || placeholder || 'Select date'}
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
        </button>
      }
    >
      <div className="w-auto overflow-hidden p-0">
        <Calendar
          locale={locale}
          selected={value}
          defaultMonth={value}
          captionLayout="dropdown"
          onSelect={(date) => {
            onChange(date);
            setIsOpen(false);
          }}
        />
      </div>
    </Popover>
  );
}
