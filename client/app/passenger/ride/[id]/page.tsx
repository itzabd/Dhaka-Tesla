'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, uuid, clearToken, isSessionExpired } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { ZONE_LABELS, Zone } from '@/lib/zones';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';

interface RideResponse {
  id: string;
  pickupZone: string;
  dropoffZone: string;
  requestedSeats: number;
  status: 'WAITING' | 'MATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  pricing: { perSeatPooledFarePoysha: number; totalPooledFarePoysha: number; currency: string };
  pool: null | {
    id: string;
    status: string;
    occupiedSeats: number;
    totalCapacity: number;
    driverArrivedAt: string | null;
    driver: { fullName: string; vehicleName: string };
  };
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export default function PassengerRidePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const rideId = params.id;
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { data, error, loading, refresh } = usePolling<RideResponse>(
    () => apiFetch<RideResponse>(`/api/rides/${rideId}`),
    3000
  );

  useEffect(() => {
    if (isSessionExpired(error)) {
      clearToken();
      router.push('/login');
    }
  }, [error, router]);

  async function onCancel() {
    setInlineError(null);
    setActionLoading(true);
    try {
      await apiFetch(`/api/rides/${rideId}/cancel`, { method: 'POST', idempotencyKey: uuid() });
      await refresh();
    } catch (err) {
      if (isSessionExpired(err)) {
        clearToken();
        router.push('/login');
        return;
      }
      if (err instanceof Error) {
        if (err.message === 'INVALID_TRANSITION') setInlineError('Cannot cancel once the driver has arrived.');
        else if (err.message === 'ALREADY_CANCELLED') setInlineError('This ride is already cancelled.');
        else setInlineError(err.message);
      }
    } finally {
      setActionLoading(false);
    }
  }

  // DATA-FIRST RENDERING: if data exists, render it even if error is set.
  // This prevents flicker on transient poll failures.
  if (data) {
    const canCancel = data.status === 'WAITING' || (data.status === 'MATCHED' && data.pool?.status === 'FORMING');
    return (
      <div className="min-h-screen bg-surface text-ink p-8">
        <div className="max-w-lg mx-auto space-y-6">
          <Link href="/passenger/history" className="text-primary underline">Back to history</Link>
          <div className="bg-card rounded-lg p-6 shadow space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-serif">Ride status</h1>
              <StatusBadge status={data.status} />
            </div>
            <div>
              <p className="text-ink-muted text-sm">Route</p>
              <p className="text-lg">{ZONE_LABELS[data.pickupZone as Zone]} → {ZONE_LABELS[data.dropoffZone as Zone]}</p>
            </div>
            <div>
              <p className="text-ink-muted text-sm">Seats</p>
              <p className="text-lg">{data.requestedSeats}</p>
            </div>
            <div>
              <p className="text-ink-muted text-sm">Fare</p>
              <p className="text-lg">৳{(data.pricing.perSeatPooledFarePoysha / 100).toFixed(2)} per seat</p>
              <p className="text-sm text-ink-muted">Total: ৳{(data.pricing.totalPooledFarePoysha / 100).toFixed(2)}</p>
            </div>
            {data.pool && (
              <div className="bg-surface-alt rounded p-4">
                <p className="text-sm text-ink-muted">Driver</p>
                <p>{data.pool.driver.fullName} · {data.pool.driver.vehicleName}</p>
                <p className="text-sm mt-1">{data.pool.occupiedSeats}/{data.pool.totalCapacity} seats occupied</p>
              </div>
            )}
            {inlineError && <p className="text-red-600 text-sm">{inlineError}</p>}
            {canCancel && (
              <button
                onClick={onCancel}
                disabled={actionLoading}
                className="bg-red-600 text-white rounded px-4 py-2 disabled:opacity-50"
              >
                {actionLoading ? 'Cancelling…' : 'Cancel ride'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingState label="Loading ride…" />;

  if (error) return <ErrorState message={error.message} backHref="/passenger/history" backLabel="Back to history" />;

  return null;
}
