'use client';

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The toggle element (already wired by the parent to flip `open`). */
  trigger: ReactNode;
  /** Panel content shown while open. */
  children: ReactNode;
  align?: 'start' | 'end';
  /** Classes on the trigger wrapper (not the floating panel). */
  className?: string;
  /** Classes on the floating panel. */
  panelClassName?: string;
}

const PANEL_GAP = 8;
const VIEWPORT_PAD = 8;

/* Portal popover so calendars/menus are never clipped by overflow:hidden ancestors. */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = 'start',
  className,
  panelClassName,
}: PopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    function place() {
      const triggerEl = containerRef.current;
      const panelEl = panelRef.current;
      if (!triggerEl || !panelEl) return;

      const triggerRect = triggerEl.getBoundingClientRect();
      const panelRect = panelEl.getBoundingClientRect();
      const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_PAD;
      const spaceAbove = triggerRect.top - VIEWPORT_PAD;
      const openUp = spaceBelow < panelRect.height + PANEL_GAP && spaceAbove > spaceBelow;

      let top = openUp
        ? triggerRect.top - panelRect.height - PANEL_GAP
        : triggerRect.bottom + PANEL_GAP;
      top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - panelRect.height - VIEWPORT_PAD));

      let left = align === 'end' ? triggerRect.right - panelRect.width : triggerRect.left;
      left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - panelRect.width - VIEWPORT_PAD));

      setCoords({ top, left });
    }

    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onOpenChange(false);
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
    <div ref={containerRef} className={cn('relative', className)}>
      {trigger}
      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              style={
                coords
                  ? { position: 'fixed', top: coords.top, left: coords.left }
                  : { position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none' }
              }
              className={cn(
                'z-[80] w-max max-w-[calc(100vw-1rem)] rounded-md bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-foreground/5 dark:ring-foreground/10',
                panelClassName,
              )}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
