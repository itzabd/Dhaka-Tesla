'use client';
import { useToast } from '@/lib/useToast';

const TONE_CLASSES: Record<string, string> = {
  info: 'bg-ink text-surface',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
};

export function Toast() {
  const toasts = useToast();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-24 md:bottom-8 right-4 md:right-8 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`rounded-lg shadow-lg px-4 py-3 text-sm ${TONE_CLASSES[t.tone] ?? TONE_CLASSES.info}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
