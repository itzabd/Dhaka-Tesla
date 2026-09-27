export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="text-center py-12 text-ink-muted">
      <p className="text-lg">{message}</p>
      {hint && <p className="text-sm mt-2">{hint}</p>}
    </div>
  );
}
