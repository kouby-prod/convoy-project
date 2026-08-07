'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface DropdownDatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder?: string;
  className?: string;
}

export function DropdownDatePicker({ value, onChange, placeholder, className }: DropdownDatePickerProps) {
  const locale = useLocale();
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
        <Button
          variant="outline"
          id="date-picker-optional"
          className="h-11 w-full justify-between font-normal"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {formattedDate || placeholder || 'Select date'}
          <ChevronDown className="size-4" />
        </Button>
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
