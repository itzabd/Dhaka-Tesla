'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, clearToken } from '@/lib/api';
import { ZONE_LABELS, Zone } from '@/lib/zones';

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
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<HistoryResponse>('/api/driver/history');
        setHistory(res.data || []);
      } catch (err) {
        if (err instanceof Error && (err.message === 'UNAUTHENTICATED' || err.message === 'TOKEN_EXPIRED')) {
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

    fetchHistory();
  }, [router]);

  return (
    <div className="min-h-screen bg-surface text-ink p-8">
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-card rounded-lg p-6 shadow text-center text-ink-muted">
            Loading trips...
          </div>
        ) : history.length === 0 ? (
          <div className="bg-card rounded-lg p-6 shadow text-center text-ink-muted">
            No completed trips yet.
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((row) => (
              <div
                key={row.poolId}
                className="bg-card rounded-lg p-6 shadow space-y-3"
              >
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <span
                      className={
                        row.status === 'COMPLETED'
                          ? 'bg-success text-white rounded px-2 py-1 text-sm font-medium'
                          : 'bg-zinc-500 text-white rounded px-2 py-1 text-sm font-medium'
                      }
                    >
                      {row.status}
                    </span>
                    <h2 className="text-lg font-semibold mt-2">
                      {ZONE_LABELS[row.initialPickupZone as Zone] || row.initialPickupZone} &rarr;{' '}
                      {ZONE_LABELS[row.farthestDropoffZone as Zone] || row.farthestDropoffZone}
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
          </div>
        )}
      </div>
    </div>
  );
}
