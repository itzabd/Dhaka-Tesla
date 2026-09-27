'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, clearToken, uuid } from '@/lib/api';
import { ZONE_LABELS, Zone } from '@/lib/zones';

interface Passenger {
  requestId: string;
  passengerName: string;
  pickupZone: string;
  dropoffZone: string;
  seatCount: number;
  individualFarePoysha: number;
}

interface Pool {
  id: string;
  status: 'FORMING' | 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  initialPickupZone: string;
  farthestDropoffZone: string;
  pickupToFarthestKm: number;
  occupiedSeats: number;
  totalCapacity: number;
  createdAt: string;
  passengers: Passenger[];
}

interface VehicleInfo {
  id: string;
  name: string;
  capacity: number;
  isOnline: boolean;
}

interface CurrentResponse {
  vehicle: VehicleInfo;
  pool: Pool | null;
}

export default function DriverPoolDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [pool, setPool] = useState<Pool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<CurrentResponse>('/api/driver/pools/current');
      setPool(res.pool);
    } catch (err) {
      if (err instanceof Error && (err.message === 'UNAUTHENTICATED' || err.message === 'TOKEN_EXPIRED')) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load pool');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function handleAdvanceStatus(targetStatus: 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED') {
    if (!pool) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiFetch<{ poolId: string; status: string }>(`/api/driver/pools/${pool.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus }),
      });

      if (targetStatus === 'COMPLETED') {
        router.push('/driver/history');
        return;
      }

      await load();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'UNAUTHENTICATED' || err.message === 'TOKEN_EXPIRED') {
          clearToken();
          router.push('/login');
          return;
        }
        if (err.message === 'INVALID_TRANSITION') {
          setError('This action is not available in the current state.');
        } else if (err.message === 'POOL_NOT_FOUND') {
          setError('Pool not found.');
        } else {
          setError(err.message);
        }
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelPool() {
    if (!pool) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/driver/pools/${pool.id}/cancel`, {
        method: 'POST',
        idempotencyKey: uuid(),
      });
      router.push('/driver/dashboard');
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'UNAUTHENTICATED' || err.message === 'TOKEN_EXPIRED') {
          clearToken();
          router.push('/login');
          return;
        }
        if (err.message === 'INVALID_TRANSITION') {
          setError('This action is not available in the current state.');
        } else if (err.message === 'POOL_NOT_FOUND') {
          setError('Pool not found.');
        } else {
          setError(err.message);
        }
      }
    } finally {
      setActionLoading(false);
    }
  }

  const statusBadgeColor: Record<string, string> = {
    FORMING: 'bg-primary text-white',
    ARRIVED: 'bg-amber-600 text-white',
    IN_TRANSIT: 'bg-blue-600 text-white',
    COMPLETED: 'bg-success text-white',
    CANCELLED: 'bg-zinc-500 text-white',
  };

  return (
    <div className="min-h-screen bg-surface text-ink p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-serif font-bold tracking-tight">Active Pool Details</h1>
            <p className="text-sm text-ink-muted">Trip lifecycle control</p>
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
            Loading pool details...
          </div>
        ) : pool === null || pool.id !== params.id ? (
          <div className="bg-card rounded-lg p-6 shadow text-center space-y-4">
            <p className="text-ink-muted">No active pool with that ID.</p>
            <Link
              href="/driver/dashboard"
              className="inline-block bg-primary text-white rounded px-4 py-2 text-sm font-medium"
            >
              Back to Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-card rounded-lg p-6 shadow space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-4">
                <div className="flex items-center gap-3">
                  <span className={`rounded px-2.5 py-1 text-sm font-medium ${statusBadgeColor[pool.status] || 'bg-zinc-500 text-white'}`}>
                    {pool.status}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {pool.occupiedSeats} / {pool.totalCapacity} seats occupied
                  </span>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold">
                  {ZONE_LABELS[pool.initialPickupZone as Zone] || pool.initialPickupZone} &rarr;{' '}
                  {ZONE_LABELS[pool.farthestDropoffZone as Zone] || pool.farthestDropoffZone}
                </h2>
                <p className="text-sm text-ink-muted mt-1">
                  Corridor Distance: {pool.pickupToFarthestKm} km
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
                  Passengers Manifest ({pool.passengers.length})
                </h3>
                <div className="divide-y divide-surface-alt border border-surface-alt rounded">
                  {pool.passengers.map((p) => (
                    <div
                      key={p.requestId}
                      className="p-3 flex justify-between items-center text-sm"
                    >
                      <div>
                        <span className="font-medium text-ink">{p.passengerName}</span>
                        <span className="text-xs text-ink-muted ml-2">
                          ({p.seatCount} {p.seatCount === 1 ? 'seat' : 'seats'})
                        </span>
                        <div className="text-xs text-ink-muted">
                          {ZONE_LABELS[p.pickupZone as Zone] || p.pickupZone} &rarr;{' '}
                          {ZONE_LABELS[p.dropoffZone as Zone] || p.dropoffZone}
                        </div>
                      </div>
                      <div className="font-medium text-ink">
                        ৳{(p.individualFarePoysha / 100).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lifecycle Actions */}
              <div className="pt-4 border-t flex flex-wrap items-center gap-4">
                {pool.status === 'FORMING' && (
                  <>
                    <button
                      onClick={() => handleAdvanceStatus('ARRIVED')}
                      disabled={actionLoading}
                      className="bg-primary text-white rounded px-4 py-2 text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
                    >
                      {actionLoading ? 'Updating...' : 'Mark Arrived'}
                    </button>
                    <button
                      onClick={handleCancelPool}
                      disabled={actionLoading}
                      className="bg-red-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      {actionLoading ? 'Cancelling...' : 'Cancel Pool'}
                    </button>
                  </>
                )}

                {pool.status === 'ARRIVED' && (
                  <>
                    <button
                      onClick={() => handleAdvanceStatus('IN_TRANSIT')}
                      disabled={actionLoading}
                      className="bg-primary text-white rounded px-4 py-2 text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
                    >
                      {actionLoading ? 'Updating...' : 'Start Trip'}
                    </button>
                    <button
                      onClick={handleCancelPool}
                      disabled={actionLoading}
                      className="bg-red-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      {actionLoading ? 'Cancelling...' : 'Cancel Pool'}
                    </button>
                  </>
                )}

                {pool.status === 'IN_TRANSIT' && (
                  <button
                    onClick={() => handleAdvanceStatus('COMPLETED')}
                    disabled={actionLoading}
                    className="bg-primary text-white rounded px-4 py-2 text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
                  >
                    {actionLoading ? 'Updating...' : 'Complete Trip'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
