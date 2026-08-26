'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SectionNavItem = {
  id: string;
  title: string;
  icon: LucideIcon;
  tone?: 'default' | 'danger';
};

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

let scrollGeneration = 0;

/** Desktop: below the sticky site nav (`lg:top-24`). Mobile: site nav + sticky chip bar. */
function sectionOffset() {
  return window.matchMedia('(min-width: 1024px)').matches ? 96 : 128;
}

function isRendered(el: HTMLElement) {
  return el.getClientRects().length > 0;
}

function scrollingElement() {
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

function isDocumentScroll(event: Event) {
  const target = event.target;
  return target === document || target === document.documentElement || target === document.body;
}

/**
 * Last section whose top has crossed the mark; at page top that is always the first rendered one.
 * Slack covers subpixels and a heading that landed a few px below the stick point — without it the
 * spy reports the previous section while the clicked block is on screen.
 */
function sectionAtMark(ids: string[]): string | null {
  const mark = sectionOffset() + 12;
  const rendered: HTMLElement[] = [];
  for (const id of ids) {
    const node = document.getElementById(id);
    if (node && isRendered(node)) rendered.push(node);
  }
  const first = rendered[0];
  if (!first) return null;
  let active = first.id;
  for (const node of rendered) {
    if (node.getBoundingClientRect().top <= mark) active = node.id;
  }
  return active;
}

/** Ease-in-out scroll. Avoids `behavior: smooth` (Chromium can drop it) and hash URLs (Next resets). */
export function scrollToSection(id: string, onDone?: () => void) {
  const el = document.getElementById(id);
  const scroller = scrollingElement();
  const html = document.documentElement;
  if (!el) {
    onDone?.();
    return;
  }

  const target = Math.max(0, el.getBoundingClientRect().top + scroller.scrollTop - sectionOffset());
  const previousBehavior = html.style.scrollBehavior;
  const previousAnchor = html.style.overflowAnchor;
  html.style.setProperty('scroll-behavior', 'auto', 'important');
  html.style.overflowAnchor = 'none';

  function finish() {
    html.style.scrollBehavior = previousBehavior;
    html.style.overflowAnchor = previousAnchor;
    onDone?.();
  }

  if (prefersReducedMotion()) {
    scroller.scrollTop = target;
    finish();
    return;
  }

  const start = scroller.scrollTop;
  const distance = target - start;
  if (Math.abs(distance) < 2) {
    finish();
    return;
  }

  const duration = Math.min(900, Math.max(560, Math.abs(distance) * 0.6));
  const generation = ++scrollGeneration;
  let startTime: number | null = null;

  function step(now: number) {
    if (generation !== scrollGeneration) {
      html.style.scrollBehavior = previousBehavior;
      html.style.overflowAnchor = previousAnchor;
      return;
    }
    if (startTime === null) startTime = now;
    const progress = Math.min(1, (now - startTime) / duration);
    scroller.scrollTop = start + distance * easeInOutCubic(progress);
    if (progress < 1) requestAnimationFrame(step);
    else finish();
  }

  requestAnimationFrame(step);
}

/**
 * In-page rail: active pill, icons, and eased section scroll.
 * Return `'skip'` from `onSelect` when the parent will scroll after a layout change.
 */
export function SectionNav({
  items,
  label,
  className,
  observeKey,
  onSelect,
}: {
  items: readonly SectionNavItem[];
  label: string;
  className?: string;
  /** Re-bind the scroll spy when wizard steps show/hide sections. */
  observeKey?: string;
  onSelect?: (id: string) => void | 'skip';
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const lockObserver = useRef(false);
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');
  const [indicator, setIndicator] = useState({ top: 0, height: 0 });
  const itemIds = items.map((item) => item.id).join();

  useEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    const ids = itemIds.split(',').filter(Boolean);
    if (ids.length === 0) return;

    let frame = 0;
    function sync() {
      if (lockObserver.current) return;
      const next = sectionAtMark(ids);
      if (next) setActiveId(next);
    }

    function onScroll(event: Event) {
      if (!isDocumentScroll(event)) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    }

    sync();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', sync);
    const unlock = () => {
      lockObserver.current = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'PageUp' ||
        event.key === 'PageDown' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === ' '
      ) {
        unlock();
      }
    };
    window.addEventListener('wheel', unlock, { passive: true });
    window.addEventListener('touchmove', unlock, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', sync);
      window.removeEventListener('wheel', unlock);
      window.removeEventListener('touchmove', unlock);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [itemIds, observeKey]);

  useLayoutEffect(() => {
    function measure() {
      const list = listRef.current;
      const active = list?.querySelector<HTMLElement>(`[data-nav-id="${activeId}"]`);
      if (!list || !active) return;
      if (window.matchMedia('(min-width: 1024px)').matches) {
        const listBox = list.getBoundingClientRect();
        const box = active.getBoundingClientRect();
        setIndicator({ top: box.top - listBox.top, height: box.height });
        return;
      }
      const left = active.offsetLeft - (list.clientWidth - active.clientWidth) / 2;
      list.scrollTo({
        left: Math.max(0, left),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeId, itemIds]);

  function onNavClick(id: string) {
    lockObserver.current = true;
    flushSync(() => setActiveId(id));
    if (onSelect?.(id) === 'skip') return;
    scrollToSection(id);
  }

  return (
    <nav
      aria-label={label}
      className={cn(
        'sticky top-16 z-30 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm',
        'sm:-mx-6 sm:px-6',
        'lg:top-24 lg:z-auto lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none',
        className,
      )}
    >
      <div className="lg:rounded-lg lg:bg-card lg:p-2 lg:shadow-sm lg:ring-1 lg:ring-foreground/5">
        <div className="relative min-w-0">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 hidden rounded-md bg-muted transition-[transform,height] duration-500 ease-out lg:block"
            style={{
              height: indicator.height || undefined,
              transform: `translateY(${indicator.top}px)`,
            }}
          />
          <ul
            ref={listRef}
            className="relative flex min-w-0 touch-pan-x gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:grid lg:gap-0.5 lg:overflow-visible"
          >
            {items.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeId;
              const danger = item.tone === 'danger';
              return (
                <li key={item.id} className="relative z-10 shrink-0">
                  <button
                    type="button"
                    data-nav-id={item.id}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onNavClick(item.id)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap outline-none',
                      'transition-colors duration-300 ease-out',
                      'max-lg:ring-1 max-lg:ring-border',
                      'focus-visible:ring-3 focus-visible:ring-ring/30',
                      active
                        ? danger
                          ? 'text-destructive max-lg:bg-destructive/10 max-lg:ring-destructive/20'
                          : 'text-foreground max-lg:bg-card max-lg:shadow-sm max-lg:ring-foreground/10'
                        : danger
                          ? 'text-muted-foreground hover:text-destructive max-lg:hover:bg-destructive/10'
                          : 'text-muted-foreground hover:text-foreground max-lg:hover:bg-muted',
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
                    {item.title}
                  </button>
                </li>
              );
            })}
          </ul>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent lg:hidden"
          />
        </div>
      </div>
    </nav>
  );
}
