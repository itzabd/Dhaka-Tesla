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
interface CurrentResponse { vehicle: VehicleInfo; pool: Pool | null; }

export default function DriverPoolDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const poolId = params.id;
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  // Terminal state flag — once the pool has transitioned to COMPLETED or CANCELLED,
  // we are navigating away. Disable fast polling and suppress the "No active pool" flash.
  const [finished, setFinished] = useState(false);

  const { data, error, loading, refresh } = usePolling<CurrentResponse>(
    () => apiFetch<CurrentResponse>('/api/driver/pools/current'),
    finished ? 60_000 : 3_000
  );

  useEffect(() => {
    if (isSessionExpired(error)) {
      clearToken();
      router.push('/login');
    }
  }, [error, router]);

  async function onAdvance(target: 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED') {
    setInlineError(null);
    setActionLoading(true);
    try {
      await apiFetch(`/api/driver/pools/${poolId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: target }),
      });
      if (target === 'COMPLETED') {
        setFinished(true);
        router.push('/driver/history');
        return;
      }
      await refresh();
    } catch (err) {
      if (isSessionExpired(err)) { clearToken(); router.push('/login'); return; }
      if (err instanceof Error) {
        if (err.message === 'INVALID_TRANSITION') setInlineError('This action is not available in the current state.');
        else if (err.message === 'POOL_NOT_FOUND') setInlineError('Pool not found.');
        else setInlineError(err.message);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function onCancelPool() {
    setInlineError(null);
    setActionLoading(true);
    try {
      await apiFetch(`/api/driver/pools/${poolId}/cancel`, {
        method: 'POST',
        idempotencyKey: uuid(),
      });
      setFinished(true);
      router.push('/driver/dashboard');
    } catch (err) {
      if (isSessionExpired(err)) { clearToken(); router.push('/login'); return; }
      if (err instanceof Error) {
        if (err.message === 'INVALID_TRANSITION') setInlineError('Cannot cancel pool once trip has started.');
        else if (err.message === 'POOL_NOT_FOUND') setInlineError('Pool not found.');
        else setInlineError(err.message);
      }
    } finally {
      setActionLoading(false);
    }
  }

  // DATA-FIRST RENDERING
  if (data) {
    const pool = data.pool;
    // If the pool was already completed/cancelled and we're navigating, don't show the
    // "No active pool" error — show a brief "Finishing…" placeholder instead.
    if (!pool || pool.id !== poolId) {
      if (finished) return <LoadingState label="Finishing…" />;
      return <ErrorState message="No active pool with that ID." backHref="/driver/dashboard" backLabel="Back to dashboard" />;
    }

    return (
      <div className="min-h-screen bg-surface text-ink p-8">
        <div className="max-w-lg mx-auto space-y-6">
          <Link href="/driver/dashboard" className="text-primary underline">Back to dashboard</Link>
          <div className="bg-card rounded-lg p-6 shadow space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-serif">Pool detail</h1>
              <StatusBadge status={pool.status} />
            </div>
            <div>
              <p className="text-ink-muted text-sm">Route</p>
              <p className="text-lg">{ZONE_LABELS[pool.initialPickupZone as Zone]} → {ZONE_LABELS[pool.farthestDropoffZone as Zone]}</p>
            </div>
            <div>
              <p className="text-ink-muted text-sm">Occupancy</p>
              <p className="text-lg">{pool.occupiedSeats}/{pool.totalCapacity} seats</p>
            </div>
            <div>
              <p className="text-ink-muted text-sm">Passengers</p>
              <ul className="space-y-2 mt-2">
                {pool.passengers.map((p) => (
                  <li key={p.requestId} className="bg-surface-alt rounded p-3">
                    <p>{p.passengerName}</p>
                    <p className="text-sm text-ink-muted">{ZONE_LABELS[p.pickupZone as Zone]} → {ZONE_LABELS[p.dropoffZone as Zone]}</p>
                    <p className="text-sm">৳{(p.individualFarePoysha / 100).toFixed(2)} · {p.seatCount} seat(s)</p>
                  </li>
                ))}
              </ul>
            </div>
            {inlineError && <p className="text-danger-dark text-sm">{inlineError}</p>}
            <div className="flex gap-2 pt-2">
              {pool.status === 'FORMING' && (
                <>
                  <button onClick={() => onAdvance('ARRIVED')} disabled={actionLoading} className="bg-primary text-white rounded px-4 py-2 disabled:opacity-50">Mark Arrived</button>
                  <button onClick={onCancelPool} disabled={actionLoading} className="bg-danger text-white rounded px-4 py-2 disabled:opacity-50">Cancel Pool</button>
                </>
              )}
              {pool.status === 'ARRIVED' && (
                <>
                  <button onClick={() => onAdvance('IN_TRANSIT')} disabled={actionLoading} className="bg-primary text-white rounded px-4 py-2 disabled:opacity-50">Start Trip</button>
                  <button onClick={onCancelPool} disabled={actionLoading} className="bg-danger text-white rounded px-4 py-2 disabled:opacity-50">Cancel Pool</button>
                </>
              )}
              {pool.status === 'IN_TRANSIT' && (
                <button onClick={() => onAdvance('COMPLETED')} disabled={actionLoading} className="bg-success text-white rounded px-4 py-2 disabled:opacity-50">Complete Trip</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingState label="Loading pool…" />;
  if (error) return <ErrorState message={error.message} backHref="/driver/dashboard" backLabel="Back to dashboard" />;
  return null;
}
