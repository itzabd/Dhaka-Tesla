'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, clearToken } from '@/lib/api';
import { ZONE_LABELS, Zone } from '@/lib/zones';

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
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setToggleError(null);
    try {
      const [currentRes, requestsRes] = await Promise.all([
        apiFetch<CurrentResponse>('/api/driver/pools/current'),
        apiFetch<RequestsResponse>('/api/driver/requests'),
      ]);
      setCurrent(currentRes);
      setRequests(requestsRes.data || []);
    } catch (err) {
      if (err instanceof Error && (err.message === 'UNAUTHENTICATED' || err.message === 'TOKEN_EXPIRED')) {
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
      if (err instanceof Error && (err.message === 'UNAUTHENTICATED' || err.message === 'TOKEN_EXPIRED')) {
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

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
              <p className="text-sm text-red-600 mt-2 font-medium">
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
                  <span className="bg-success text-white rounded px-2 py-1 text-sm">
                    {current.pool.status}
                  </span>
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

          {!current?.vehicle.isOnline ? (
            <p className="text-sm text-ink-muted">You&apos;re offline.</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-ink-muted">No eligible requests yet.</p>
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
                      disabled
                      className="w-full bg-zinc-300 text-zinc-500 rounded px-4 py-2 text-sm font-medium cursor-not-allowed"
                    >
                      Accept (Phase 6)
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
