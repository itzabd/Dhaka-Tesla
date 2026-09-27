export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-ink-muted">
      <span>{label}</span>
    </div>
  );
}
