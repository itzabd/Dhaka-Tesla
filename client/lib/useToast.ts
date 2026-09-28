'use client';
import { useEffect, useState } from 'react';

export type ToastMessage = {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
};

type Listener = (toasts: ToastMessage[]) => void;

const listeners = new Set<Listener>();
let currentToasts: ToastMessage[] = [];

function notify(): void {
  listeners.forEach((listener) => {
    listener([...currentToasts]);
  });
}

export function pushToast(text: string, tone: ToastMessage['tone'] = 'info', ttlMs = 4000): void {
  if (typeof window === 'undefined') return;
  const id = Math.random().toString(36).slice(2);
  currentToasts = [...currentToasts, { id, text, tone }];
  notify();
  window.setTimeout(() => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    notify();
  }, ttlMs);
}

export function useToast(): ToastMessage[] {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  useEffect(() => {
    const listener: Listener = (next) => setToasts(next);
    listeners.add(listener);
    setToasts([...currentToasts]);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return toasts;
}
