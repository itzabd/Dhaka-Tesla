'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, clearToken, isSessionExpired } from '@/lib/api';
import { ZONE_LABELS, Zone } from '@/lib/zones';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { PassengerSidebar } from '@/components/PassengerSidebar';
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

type FilterType = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export default function RideHistoryPage() {
  const { isAuthorized } = useRequireAuth();
  const router = useRouter();
  const [rows, setRows] = useState<RideRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('ALL');

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

  // Filter rows client-side
  const filteredRows = useMemo(() => {
    if (filter === 'ACTIVE') {
      return rows.filter((r) => ['WAITING', 'MATCHED', 'IN_PROGRESS'].includes(r.status));
    }
    if (filter === 'COMPLETED') return rows.filter((r) => r.status === 'COMPLETED');
    if (filter === 'CANCELLED') return rows.filter((r) => r.status === 'CANCELLED');
    return rows;
  }, [rows, filter]);

  // Aggregate stats across currently loaded rows
  const stats = useMemo(() => {
    const totalCount = rows.length;
    const activeCount = rows.filter((r) => ['WAITING', 'MATCHED', 'IN_PROGRESS'].includes(r.status)).length;
    const completedCount = rows.filter((r) => r.status === 'COMPLETED').length;
    const cancelledCount = rows.filter((r) => r.status === 'CANCELLED').length;
    const totalPoysha = rows
      .filter((r) => r.status === 'COMPLETED')
      .reduce((sum, r) => sum + r.provisionalPooledFarePoysha, 0);
    return { totalCount, activeCount, completedCount, cancelledCount, totalPoysha };
  }, [rows]);

  if (!isAuthorized) return <LoadingState label="Checking session…" />;
  if (loading) return <LoadingState label="Loading history…" />;
  if (error) return <ErrorState message={error} backHref="/passenger/book" backLabel="Back to booking" />;

  return (
    <div className="min-h-screen bg-surface text-ink font-sans pb-20 md:pb-0">
      <PassengerSidebar variant="sidebar" active="history" />

      <main className="md:ml-60 p-4 md:p-8">
        <div className="max-w-[960px] mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[rgba(0,0,0,0.08)] gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-ink tracking-tight">Ride History</h1>
              <p className="text-xs text-ink-muted font-medium mt-0.5">Bullet · 3 seats</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success/10 text-success border border-success/20">
                <span className="w-2 h-2 rounded-full bg-success" />
                CORRIDOR TRIPS
              </span>
            </div>
          </div>

          {/* Stats Summary Strip (Across Loaded Trips) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-xl p-5 shadow-sm">
              <span className="text-xs font-medium text-ink-muted uppercase tracking-wider block">
                Loaded trips
              </span>
              <span className="text-xl font-extrabold text-ink mt-1 block tabular-nums">
                {stats.totalCount} rides
              </span>
            </div>
            <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-xl p-5 shadow-sm">
              <span className="text-xs font-medium text-ink-muted uppercase tracking-wider block">
                Total spent (completed)
              </span>
              <span className="text-xl font-extrabold text-primary mt-1 block tabular-nums">
                ৳{(stats.totalPoysha / 100).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Filter Pills Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setFilter('ALL')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap shadow-sm ${
                  filter === 'ALL'
                    ? 'bg-primary text-white'
                    : 'bg-card border border-[rgba(0,0,0,0.08)] text-ink-muted hover:text-ink'
                }`}
              >
                All rides ({stats.totalCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('ACTIVE')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                  filter === 'ACTIVE'
                    ? 'bg-primary text-white font-bold shadow-sm'
                    : 'bg-card border border-[rgba(0,0,0,0.08)] text-ink-muted hover:text-ink'
                }`}
              >
                Active / In Progress ({stats.activeCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('COMPLETED')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                  filter === 'COMPLETED'
                    ? 'bg-primary text-white font-bold shadow-sm'
                    : 'bg-card border border-[rgba(0,0,0,0.08)] text-ink-muted hover:text-ink'
                }`}
              >
                Completed ({stats.completedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('CANCELLED')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                  filter === 'CANCELLED'
                    ? 'bg-primary text-white font-bold shadow-sm'
                    : 'bg-card border border-[rgba(0,0,0,0.08)] text-ink-muted hover:text-ink'
                }`}
              >
                Cancelled ({stats.cancelledCount})
              </button>
            </div>
            <span className="text-xs text-ink-muted font-medium">
              Showing {filteredRows.length} of {stats.totalCount} rides
            </span>
          </div>

          {/* Rides Content */}
          {rows.length === 0 ? (
            <EmptyState message="No rides yet." hint="Book your first ride from the dashboard." />
          ) : filteredRows.length === 0 ? (
            <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-xl p-8 text-center text-xs text-ink-muted">
              No rides matching the selected filter.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Desktop Table View */}
              <div className="hidden md:block bg-card border border-[rgba(0,0,0,0.06)] rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-surface-alt border-b border-[rgba(0,0,0,0.06)] text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                        <th className="py-3.5 px-5">Date & Time</th>
                        <th className="py-3.5 px-4">Corridor Zones</th>
                        <th className="py-3.5 px-4">Fare Paid</th>
                        <th className="py-3.5 px-3 text-center">Status</th>
                        <th className="py-3.5 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(0,0,0,0.04)] font-medium">
                      {filteredRows.map((row) => (
                        <tr key={row.id} className="hover:bg-surface/50 transition">
                          <td className="py-3.5 px-5 font-semibold text-ink whitespace-nowrap tabular-nums">
                            {new Date(row.createdAt).toLocaleString(undefined, {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-ink whitespace-nowrap">
                            {ZONE_LABELS[row.pickupZone as Zone] ?? row.pickupZone}
                            <span className="text-ink-muted font-normal mx-1.5">→</span>
                            {ZONE_LABELS[row.dropoffZone as Zone] ?? row.dropoffZone}
                          </td>
                          <td className="py-3.5 px-4 font-extrabold text-ink tabular-nums">
                            ৳{(row.provisionalPooledFarePoysha / 100).toFixed(2)}
                          </td>
                          <td className="py-3.5 px-3 text-center">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <Link
                              href={`/passenger/ride/${row.id}`}
                              className="font-bold text-primary hover:text-primary-dark hover:underline text-xs"
                            >
                              View details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card List View */}
              <div className="md:hidden space-y-3">
                {filteredRows.map((row) => (
                  <div
                    key={row.id}
                    className="bg-card border border-[rgba(0,0,0,0.06)] rounded-xl p-4 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-xs text-ink">
                          {ZONE_LABELS[row.pickupZone as Zone] ?? row.pickupZone}
                          <span className="text-ink-muted font-normal mx-1">→</span>
                          {ZONE_LABELS[row.dropoffZone as Zone] ?? row.dropoffZone}
                        </div>
                        <div className="text-[10px] text-ink-muted mt-0.5 tabular-nums">
                          {new Date(row.createdAt).toLocaleString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <StatusBadge status={row.status} />
                    </div>

                    <div className="pt-2 border-t border-[rgba(0,0,0,0.05)] flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-ink-muted block">Fare</span>
                        <span className="text-xs font-bold text-ink tabular-nums">
                          ৳{(row.provisionalPooledFarePoysha / 100).toFixed(2)}
                        </span>
                      </div>
                      <Link
                        href={`/passenger/ride/${row.id}`}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        View details →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {nextCursor !== null && (
                <div className="text-center pt-4">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    disabled={loadingMore}
                    className="px-6 py-2.5 bg-card border border-[rgba(0,0,0,0.08)] hover:bg-surface text-ink text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading more…' : 'Load more trips'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <PassengerSidebar variant="bottom-nav" active="history" />
    </div>
  );
}
