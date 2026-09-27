'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, clearToken, isSessionExpired } from '@/lib/api';
import { ZONE_LABELS, Zone } from '@/lib/zones';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';

interface RideRow {
  id: string;
  pickupZone: string;
  dropoffZone: string;
  status: string;
  createdAt: string;
  provisionalPooledFarePoysha: number;
}

interface HistoryResponse {
  data: RideRow[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export default function RideHistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RideRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const res = await apiFetch<HistoryResponse>('/api/rides/history');
      setRows(res.data);
      setNextCursor(res.pagination.nextCursor);
    } catch (err) {
      if (isSessionExpired(err)) {
        clearToken();
        router.push('/login');
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
        `/api/rides/history?cursor=${encodeURIComponent(nextCursor)}`
      );
      setRows((prev) => [...prev, ...res.data]);
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
  }, []);

  if (loading) return <LoadingState label="Loading history…" />;
  if (error) return <ErrorState message={error} backHref="/passenger/book" backLabel="Back to booking" />;

  return (
    <div className="min-h-screen bg-surface text-ink p-8 font-sans">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-serif">Ride History</h1>
          <Link href="/passenger/book" className="text-sm text-primary hover:underline">
            Book a Ride
          </Link>
        </div>

        {rows.length === 0 ? (
          <EmptyState message="No rides yet." hint="Book your first ride from the dashboard." />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.id}
                className="bg-card rounded-lg p-4 shadow flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-base">
                    {ZONE_LABELS[row.pickupZone as Zone] ?? row.pickupZone} → {ZONE_LABELS[row.dropoffZone as Zone] ?? row.dropoffZone}
                  </p>
                  <p className="text-xs text-ink-muted mt-1">
                    {new Date(row.createdAt).toLocaleString()} · ৳{(row.provisionalPooledFarePoysha / 100).toFixed(2)} / seat
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={row.status} />
                  <Link
                    href={`/passenger/ride/${row.id}`}
                    className="text-primary hover:underline text-sm font-medium"
                  >
                    View
                  </Link>
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
