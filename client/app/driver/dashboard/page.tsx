'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, clearToken, uuid, isSessionExpired } from '@/lib/api';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { DriverSidebar } from '@/components/DriverSidebar';
import { RequestCard } from '@/components/driver/RequestCard';
import { ActivePoolCard } from '@/components/driver/ActivePoolCard';
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
  const { isAuthorized } = useRequireAuth();
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

  if (!isAuthorized) return <LoadingState label="Checking session…" />;
  if (loading && !current) return <LoadingState label="Loading dashboard…" />;

  const isOnline = current?.vehicle.isOnline ?? false;
  const pool = current?.pool;

  return (
    <div className="min-h-screen bg-surface text-ink font-sans pb-20 md:pb-0">
      <DriverSidebar variant="sidebar" active="dashboard" />

      <main className="md:ml-60 p-4 md:p-8">
        <div className="max-w-[960px] mx-auto space-y-6">
          {/* Top Strip: Driver Info, Online Toggle & Refresh */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[rgba(0,0,0,0.08)] gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight text-ink">
                  {current?.vehicle ? `${current.vehicle.name} Cockpit` : 'Driver Cockpit'}
                </h1>
                <span className="inline-flex items-center gap-1 bg-success/10 text-success text-xs font-semibold px-2 py-0.5 rounded-md">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd" />
                  </svg>
                  Verified
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-ink-muted">
                <span>Vehicle: {current?.vehicle.name ?? 'Autonomous'} · {current?.vehicle.capacity ?? 3} seats</span>
                <span>•</span>
                <span className="text-ink-muted">Fixed corridor pooling</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="px-3.5 py-1.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white hover:bg-surface text-xs font-semibold shadow-sm transition"
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>

              <button
                type="button"
                onClick={handleToggleOnline}
                disabled={isToggling}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs tracking-wider uppercase transition shadow-sm ${
                  isOnline
                    ? 'bg-success/10 border border-success/30 text-success hover:bg-success/20'
                    : 'bg-zinc-100 border border-zinc-300 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-success' : 'bg-zinc-400'}`} />
                <span>{isToggling ? 'Updating…' : isOnline ? 'Online' : 'Offline'}</span>
              </button>
            </div>
          </div>

          {error && <ErrorState message={error} />}

          {toggleError && (
            <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-amber-800 text-xs font-medium">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-800 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
                <span>{toggleError}</span>
              </div>
              <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Offline Guard</span>
            </div>
          )}

          {/* Section: Main Active Pool Card */}
          <ActivePoolCard pool={pool} />

          {/* Section: Compatible Corridor Requests */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink">Compatible Requests</h3>
                <p className="text-xs text-ink-muted">Nearby passengers travelling along your designated corridor</p>
              </div>
              <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                {requests.length} Match{requests.length === 1 ? '' : 'es'} Available
              </span>
            </div>

            {inlineError && (
              <div className="bg-danger/10 text-danger-dark p-3 rounded-lg text-xs font-medium">
                {inlineError}
              </div>
            )}

            {!isOnline ? (
              <div className="bg-surface-alt border border-[rgba(0,0,0,0.08)] rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-ink">You are currently offline</div>
                  <p className="text-[11px] text-ink-muted">Go online to receive pool requests on your route.</p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleOnline}
                  disabled={isToggling}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  Go Online
                </button>
              </div>
            ) : requests.length === 0 ? (
              <EmptyState message="No eligible requests yet." hint="Toggle online to see incoming rides." />
            ) : (
              <div className="space-y-3">
                {requests.map((r) => (
                  <RequestCard key={r.id} request={r} onAccept={onAccept} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <DriverSidebar variant="bottom-nav" active="dashboard" />
    </div>
  );
}
