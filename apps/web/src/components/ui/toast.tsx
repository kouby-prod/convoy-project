'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastBus = {
  items: ToastItem[];
  listeners: Set<(items: ToastItem[]) => void>;
  nextId: number;
};

const DISMISS_MS = 4500;
const BUS_KEY = '__convoyToastBus';

function bus(): ToastBus {
  const globalTarget = globalThis as typeof globalThis & { [BUS_KEY]?: ToastBus };
  if (!globalTarget[BUS_KEY]) {
    globalTarget[BUS_KEY] = { items: [], listeners: new Set(), nextId: 0 };
  }
  return globalTarget[BUS_KEY];
}

function emit() {
  const { items, listeners } = bus();
  for (const listener of listeners) listener(items);
}

function dismiss(id: number) {
  const state = bus();
  state.items = state.items.filter((item) => item.id !== id);
  emit();
}

/** Fire-and-forget feedback that survives a navigation (book → pay). */
export function toast(message: string, tone: ToastTone = 'success') {
  const state = bus();
  const id = ++state.nextId;
  state.items = [...state.items, { id, message, tone }];
  emit();
  window.setTimeout(() => dismiss(id), DISMISS_MS);
}

export function Toaster({ dismissLabel = 'Dismiss' }: { dismissLabel?: string }) {
  const [toasts, setToasts] = useState<ToastItem[]>(() => bus().items);

  useEffect(() => {
    const state = bus();
    state.listeners.add(setToasts);
    setToasts(state.items);
    return () => {
      state.listeners.delete(setToasts);
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-4 sm:w-[min(100%-2rem,22rem)]">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} dismissLabel={dismissLabel} />
      ))}
    </div>
  );
}

function ToastCard({ item, dismissLabel }: { item: ToastItem; dismissLabel: string }) {
  const Icon = item.tone === 'error' ? CircleAlert : item.tone === 'success' ? CheckCircle2 : Info;

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-md px-3.5 py-3 text-sm shadow-lg ring-1',
        item.tone === 'error' && 'bg-destructive/10 text-destructive ring-destructive/20',
        item.tone === 'success' && 'bg-card text-foreground ring-foreground/10',
        item.tone === 'info' && 'bg-card text-foreground ring-foreground/10',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          item.tone === 'success' && 'text-success',
          item.tone === 'info' && 'text-primary',
        )}
        strokeWidth={2}
        aria-hidden
      />
      <p className="min-w-0 flex-1 leading-snug">{item.message}</p>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label={dismissLabel}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-current/70 outline-none transition-colors hover:bg-foreground/5 hover:text-current focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <X className="size-3.5" strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
