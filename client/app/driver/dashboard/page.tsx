'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, clearToken, uuid, isSessionExpired } from '@/lib/api';
import { ZONE_LABELS, Zone } from '@/lib/zones';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';

interface VehicleInfo {
  id: string;
  name: string;
  capacity: number;
  isOnline: boolean;
}

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
  status: string;
  initialPickupZone: string;
  farthestDropoffZone: string;
  pickupToFarthestKm: number;
  occupiedSeats: number;
  totalCapacity: number;
  createdAt: string;
  passengers: Passenger[];
}

interface CurrentResponse {
  vehicle: VehicleInfo;
  pool: Pool | null;
}

interface RequestRow {
  id: string;
  passengerName: string;
  pickupZone: string;
  dropoffZone: string;
  requestedSeats: number;
  provisionalPooledFarePoysha: number;
  createdAt: string;
}

interface RequestsResponse {
  data: RequestRow[];
}

export default function DriverDashboardPage() {
  const router = useRouter();
  const [current, setCurrent] = useState<CurrentResponse | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setInlineError(null);
    setToggleError(null);
    try {
      const [currentRes, requestsRes] = await Promise.all([
        apiFetch<CurrentResponse>('/api/driver/pools/current'),
        apiFetch<RequestsResponse>('/api/driver/requests'),
      ]);
      setCurrent(currentRes);
      setRequests(requestsRes.data || []);
    } catch (err) {
      if (isSessionExpired(err)) {
        clearToken();
        router.push('/login');
        return;
      }
      if (err instanceof Error && err.message === 'VEHICLE_NOT_FOUND') {
        setError('Your account has no active vehicle. Contact support.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleOnline() {
    if (!current?.vehicle) return;
    setIsToggling(true);
    setToggleError(null);
    try {
      const res = await apiFetch<VehicleInfo>('/api/driver/online', {
        method: 'PATCH',
        body: JSON.stringify({ isOnline: !current.vehicle.isOnline }),
      });
      setCurrent((prev) => (prev ? { ...prev, vehicle: { ...prev.vehicle, isOnline: res.isOnline } } : null));
      await load();
    } catch (err) {
      if (isSessionExpired(err)) {
        clearToken();
        router.push('/login');
        return;
      }
      if (err instanceof Error && err.message === 'DRIVER_HAS_ACTIVE_POOL') {
        setToggleError('You have an active pool. Complete or cancel it before going offline.');
        return;
      }
      if (err instanceof Error && err.message === 'VEHICLE_NOT_FOUND') {
        setError('Your account has no active vehicle. Contact support.');
        return;
      }
      setToggleError(err instanceof Error ? err.message : 'Failed to update online status');
    } finally {
      setIsToggling(false);
    }
  }

  async function onAccept(requestId: string) {
    setInlineError(null);
    try {
      await apiFetch(`/api/driver/requests/${requestId}/accept`, {
        method: 'POST',
        idempotencyKey: uuid(),
      });
      await load();
    } catch (err) {
      if (isSessionExpired(err)) {
        clearToken();
        router.push('/login');
        return;
      }
      if (err instanceof Error) {
        if (err.message === 'CAPACITY_EXCEEDED') {
          setInlineError("This request exceeds Bullet's remaining capacity.");
        } else if (err.message === 'INCOMPATIBLE_ROUTE') {
          setInlineError("This request is outside the current pool's corridor.");
        } else if (err.message === 'DRIVER_OFFLINE') {
          setInlineError('Go online before accepting rides.');
        } else if (err.message === 'INVALID_TRANSITION') {
          setInlineError('This request is no longer available.');
        } else if (err.message === 'RIDE_NOT_FOUND') {
          setInlineError('This request no longer exists.');
        } else {
          setInlineError(err.message);
        }
      }
    }
  }

  if (loading && !current) {
    return <LoadingState label="Loading dashboard…" />;
  }

  return (
    <div className="min-h-screen bg-surface text-ink p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold tracking-tight">Driver Cockpit</h1>
            <p className="text-sm text-ink-muted">Dhaka Tesla Autonomous Fleet</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/driver/history"
              className="text-sm font-medium text-primary hover:underline"
            >
              Trip History
            </Link>
            <button
              onClick={load}
              disabled={loading}
              className="bg-card text-ink border border-surface-alt rounded px-3 py-1.5 text-sm hover:bg-surface-alt shadow-sm"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && <ErrorState message={error} />}

        {/* Vehicle & Online Status */}
        {current && (
          <div className="bg-card rounded-lg p-6 shadow space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold">{current.vehicle.name}</h2>
                  <span
                    className={
                      current.vehicle.isOnline
                        ? 'bg-success text-white rounded px-2 py-1 text-sm'
                        : 'bg-zinc-400 text-white rounded px-2 py-1 text-sm'
                    }
                  >
                    {current.vehicle.isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="text-sm text-ink-muted mt-1">
                  Vehicle Capacity: {current.vehicle.capacity} seats
                </p>
              </div>

              <div>
                <button
                  onClick={handleToggleOnline}
                  disabled={isToggling}
                  className={
                    current.vehicle.isOnline
                      ? 'bg-zinc-700 hover:bg-zinc-800 text-white rounded px-4 py-2 text-sm font-medium'
                      : 'bg-primary hover:bg-primary-dark text-white rounded px-4 py-2 text-sm font-medium'
                  }
                >
                  {isToggling
                    ? 'Updating...'
                    : current.vehicle.isOnline
                    ? 'Go Offline'
                    : 'Go Online'}
                </button>
              </div>
            </div>

            {toggleError && (
              <p className="text-sm text-danger-dark mt-2 font-medium">
                {toggleError}
              </p>
            )}
          </div>
        )}

        {/* Current Pool Card */}
        <div className="bg-card rounded-lg p-6 shadow space-y-4">
          <h2 className="text-xl font-semibold font-serif">Current Pool</h2>

          {current?.pool ? (
            <div className="space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-3">
                <div className="flex items-center gap-2">
                  <StatusBadge status={current.pool.status} />
                  <span className="text-sm text-ink-muted">
                    {current.pool.occupiedSeats} / {current.pool.totalCapacity} seats occupied
                  </span>
                </div>
                <Link
                  href={`/driver/pool/${current.pool.id}`}
                  className="text-primary hover:underline text-sm font-medium"
                >
                  View pool
                </Link>
              </div>

              <div>
                <p className="text-sm font-medium text-ink">
                  Route:{' '}
                  <span className="font-normal text-ink-muted">
                    {ZONE_LABELS[current.pool.initialPickupZone as Zone] || current.pool.initialPickupZone} &rarr;{' '}
                    {ZONE_LABELS[current.pool.farthestDropoffZone as Zone] || current.pool.farthestDropoffZone}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
                  Manifest Passengers ({current.pool.passengers.length})
                </h3>
                <div className="divide-y divide-surface-alt border border-surface-alt rounded">
                  {current.pool.passengers.map((p) => (
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
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No active pool.</p>
          )}
        </div>

        {/* Requests Inbox */}
        <div className="bg-card rounded-lg p-6 shadow space-y-4">
          <h2 className="text-xl font-semibold font-serif">Ride Requests Inbox</h2>

          {inlineError && (
            <div className="bg-danger/10 text-danger-dark p-3 rounded mt-4">
              {inlineError}
            </div>
          )}

          {!current?.vehicle.isOnline ? (
            <p className="text-sm text-ink-muted">You&apos;re offline.</p>
          ) : requests.length === 0 ? (
            <EmptyState message="No eligible requests yet." hint="Toggle online to see incoming rides." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {requests.map((r) => (
                <div
                  key={r.id}
                  className="border border-surface-alt rounded-lg p-4 space-y-3 bg-surface-alt/40 flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-ink">{r.passengerName}</h3>
                      <span className="text-xs text-ink-muted">
                        {r.requestedSeats} {r.requestedSeats === 1 ? 'seat' : 'seats'}
                      </span>
                    </div>
                    <p className="text-sm text-ink-muted">
                      {ZONE_LABELS[r.pickupZone as Zone] || r.pickupZone} &rarr;{' '}
                      {ZONE_LABELS[r.dropoffZone as Zone] || r.dropoffZone}
                    </p>
                    <p className="text-sm font-medium text-primary">
                      ৳{(r.provisionalPooledFarePoysha / 100).toFixed(2)}
                    </p>
                  </div>

                  <div>
                    <button
                      onClick={() => onAccept(r.id)}
                      className="w-full bg-primary hover:bg-primary-dark text-white rounded px-4 py-2 text-sm font-medium"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
