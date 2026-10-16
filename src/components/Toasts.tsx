import React, { useEffect, useState } from 'react';

// App-wide feedback for saves and errors. `toast.success/error` can be called from
// anywhere; <Toasts /> is rendered once in App.

export type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (items: ToastItem[]) => void;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function push(kind: ToastKind, message: string) {
  const id = nextId++;
  items = [...items, { id, kind, message }].slice(-4);
  listeners.forEach((l) => l(items));
  setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  listeners.forEach((l) => l(items));
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
};

const STYLES: Record<ToastKind, string> = {
  success: 'bg-emerald-700 text-white',
  error: 'bg-red-700 text-white',
  info: 'bg-slate-800 text-white',
};

export function Toasts() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[min(92vw,28rem)]" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm shadow-lg flex items-start gap-3 ${STYLES[t.kind]}`}>
          <span className="flex-1 leading-relaxed">{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="إغلاق" className="opacity-80 hover:opacity-100 cursor-pointer">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
