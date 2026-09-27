'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, clearToken, isSessionExpired } from '@/lib/api';
import { ZONE_LABELS, Zone } from '@/lib/zones';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';

interface HistoryRow {
  poolId: string;
  status: string;
  initialPickupZone: string;
  farthestDropoffZone: string;
  occupiedSeats: number;
  totalCapacity: number;
  totalFareCollectedPoysha: number;
  passengerCount: number;
  passengerNames: string[];
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

interface HistoryResponse {
  data: HistoryRow[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export default function DriverHistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch<HistoryResponse>('/api/driver/history');
      setRows(res.data || []);
      setNextCursor(res.pagination.nextCursor);
    } catch (err) {
      if (isSessionExpired(err)) {
        clearToken();
        router.push('/login');
        return;
      }
      if (err instanceof Error && err.message === 'VEHICLE_NOT_FOUND') {
        setError('Your account has no active vehicle.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  async function onLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch<HistoryResponse>(
        `/api/driver/history?cursor=${encodeURIComponent(nextCursor)}`
      );
      setRows((prev) => [...prev, ...(res.data || [])]);
      setNextCursor(res.pagination.nextCursor);
    } catch (err) {
      if (isSessionExpired(err)) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingState label="Loading trips…" />;
  if (error) return <ErrorState message={error} backHref="/driver/dashboard" backLabel="Back to dashboard" />;

  return (
    <div className="min-h-screen bg-surface text-ink p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold tracking-tight">Trip History</h1>
            <p className="text-sm text-ink-muted">Past pool journeys</p>
          </div>
          <Link
            href="/driver/dashboard"
            className="text-sm font-medium text-primary hover:underline"
          >
            &larr; Back to Dashboard
          </Link>
        </div>

        {rows.length === 0 ? (
          <EmptyState message="No completed trips yet." hint="Complete a pool to see it here." />
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <div
                key={row.poolId}
                className="bg-card rounded-lg p-6 shadow space-y-3"
              >
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <StatusBadge status={row.status} />
                    <h2 className="text-lg font-semibold mt-2">
                      {ZONE_LABELS[row.initialPickupZone as Zone] ?? row.initialPickupZone} &rarr;{' '}
                      {ZONE_LABELS[row.farthestDropoffZone as Zone] ?? row.farthestDropoffZone}
                    </h2>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-ink">
                      ৳{(row.totalFareCollectedPoysha / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {row.occupiedSeats} / {row.totalCapacity} seats
                    </p>
                  </div>
                </div>

                <div className="border-t border-surface-alt pt-3 text-sm space-y-1">
                  <p className="text-ink">
                    <span className="text-ink-muted">Passengers: </span>
                    {row.passengerNames.length > 0
                      ? row.passengerNames.join(', ')
                      : 'None'}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Created: {new Date(row.createdAt).toLocaleString()}
                    {row.completedAt && ` • Completed: ${new Date(row.completedAt).toLocaleString()}`}
                    {row.cancelledAt && ` • Cancelled: ${new Date(row.cancelledAt).toLocaleString()}`}
                  </p>
                </div>
              </div>
            ))}

            {nextCursor !== null && (
              <div className="text-center pt-2">
                <button
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="bg-primary text-white rounded px-4 py-2 text-sm disabled:opacity-50"
                >
                  {loadingMore ? 'Loading more…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
