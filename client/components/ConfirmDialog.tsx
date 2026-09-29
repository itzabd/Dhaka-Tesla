'use client';
import { useEffect } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBg =
    variant === 'danger'
      ? 'bg-danger hover:bg-danger-dark focus:ring-danger/40'
      : 'bg-warning hover:bg-warning-dark focus:ring-warning/40';

  const iconColor = variant === 'danger' ? 'text-danger' : 'text-warning';
  const iconBg = variant === 'danger' ? 'bg-danger/10' : 'bg-warning/10';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirm-title"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-[rgba(0,0,0,0.08)] p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-10 h-10 rounded-full ${iconBg} flex items-center justify-center`}>
            {variant === 'danger' ? (
              <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            ) : (
              <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <div className="flex-1 pt-0.5">
            <h2 id="confirm-title" className="text-sm font-bold text-ink leading-snug">
              {title}
            </h2>
            <p className="mt-1 text-xs text-ink-muted leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="border-t border-[rgba(0,0,0,0.06)]" />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-ink-muted bg-surface-alt hover:bg-[#e4e1db] border border-[rgba(0,0,0,0.08)] rounded-lg transition focus:outline-none focus:ring-2 focus:ring-ink/20"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-bold text-white rounded-lg shadow-sm transition focus:outline-none focus:ring-2 ${confirmBg}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
