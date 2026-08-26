'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  showLabel: string;
  hideLabel: string;
};

/** Password field with a show/hide control that never submits the form. */
export function PasswordInput({
  showLabel,
  hideLabel,
  className,
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-11', className)} {...inputProps} />
      <button
        type="button"
        onClick={() => setVisible((open) => !open)}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        {visible ? <EyeOff className="size-4" strokeWidth={2.25} aria-hidden /> : <Eye className="size-4" strokeWidth={2.25} aria-hidden />}
      </button>
    </div>
  );
}
