const COLORS: Record<string, string> = {
  WAITING: 'bg-yellow-100 text-yellow-800',
  MATCHED: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-primary/10 text-primary',
  COMPLETED: 'bg-success/10 text-success-dark',
  CANCELLED: 'bg-red-100 text-red-800',
  FORMING: 'bg-blue-100 text-blue-800',
  ARRIVED: 'bg-primary/10 text-primary',
  IN_TRANSIT: 'bg-primary/20 text-primary-dark',
};

const LABELS: Record<string, string> = {
  WAITING: 'Waiting',
  MATCHED: 'Matched',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  FORMING: 'Forming pool',
  ARRIVED: 'Driver arrived',
  IN_TRANSIT: 'In transit',
};

export function StatusBadge({ status }: { status: string }) {
  const color = COLORS[status] ?? 'bg-gray-100 text-gray-800';
  const label = LABELS[status] ?? status;
  return (
    <span className={`inline-block rounded px-2 py-1 text-sm font-medium ${color}`}>
      {label}
    </span>
  );
}
