'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The toggle element (already wired by the parent to flip `open`). */
  trigger: ReactNode;
  /** Panel content shown while open. */
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

/* Minimal popover: a relatively-positioned trigger with an absolutely-positioned
   panel. Closes on outside pointer-down and Escape. On-system surface: heavy
   radius, soft shadow over a hairline ring. */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = 'start',
  className,
}: PopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={containerRef} className="relative">
      {trigger}
      {open && (
        <div
          role="dialog"
          className={cn(
            'absolute top-full z-50 mt-2 rounded-3xl bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-foreground/5 dark:ring-foreground/10',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
