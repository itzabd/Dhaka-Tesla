'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, clearToken } from '@/lib/api';
import { ZONE_LABELS, Zone } from '@/lib/zones';

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
  const [history, setHistory] = useState<RideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await apiFetch<HistoryResponse>('/api/rides/history');
      setHistory(data.data);
    } catch (err) {
      if (err instanceof Error && (err.message === 'UNAUTHENTICATED' || err.message === 'TOKEN_EXPIRED')) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-surface text-ink p-8 font-sans">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-serif">Ride History</h1>
          <Link href="/passenger/book" className="text-sm text-primary hover:underline">
            Book a Ride
          </Link>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {loading ? (
          <p className="text-ink-muted">Loading history…</p>
        ) : history.length === 0 ? (
          <div className="bg-card rounded-lg p-8 text-center text-ink-muted shadow">
            <p>No rides yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((ride) => {
              const pickupLabel = ZONE_LABELS[ride.pickupZone as Zone] || ride.pickupZone;
              const dropoffLabel = ZONE_LABELS[ride.dropoffZone as Zone] || ride.dropoffZone;

              return (
                <Link
                  key={ride.id}
                  href={`/passenger/ride/${ride.id}`}
                  className="block bg-card rounded-lg p-4 shadow hover:border-primary border border-transparent transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-base">
                        {pickupLabel} → {dropoffLabel}
                      </p>
                      <p className="text-xs text-ink-muted mt-1">
                        {new Date(ride.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-xs px-2.5 py-1 rounded font-semibold inline-block mb-1 ${
                          ride.status === 'WAITING'
                            ? 'bg-amber-100 text-amber-800'
                            : ride.status === 'MATCHED'
                            ? 'bg-blue-100 text-blue-800'
                            : ride.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-800'
                            : ride.status === 'CANCELLED'
                            ? 'bg-gray-200 text-gray-700'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {ride.status}
                      </span>
                      <p className="text-sm font-medium">
                        ৳{(ride.provisionalPooledFarePoysha / 100).toFixed(2)} / seat
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
