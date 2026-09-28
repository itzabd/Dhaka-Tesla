'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, uuid, clearToken, isSessionExpired } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { ZONE_LABELS, Zone } from '@/lib/zones';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { PassengerSidebar } from '@/components/PassengerSidebar';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { pushToast } from '@/lib/useToast';

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
  const { isAuthorized } = useRequireAuth();
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

  const previousStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const current = data?.status;
    const previous = previousStatusRef.current;
    if (current === 'CANCELLED' && previous && previous !== 'CANCELLED') {
      pushToast('Your ride was cancelled by the driver.', 'warning');
    }
    if (current) previousStatusRef.current = current;
  }, [data?.status]);

  async function onCancel() {
    if (!window.confirm('Cancel this ride? This cannot be undone.')) return;
    setInlineError(null);
    setActionLoading(true);
    try {
      await apiFetch(`/api/rides/${rideId}/cancel`, { method: 'POST', idempotencyKey: uuid() });
      pushToast('Ride cancelled. No refund — cash payment.', 'success');
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
        pushToast(`Cancellation failed: ${err.message}`, 'danger');
      }
    } finally {
      setActionLoading(false);
    }
  }

  if (!isAuthorized) return <LoadingState label="Checking session…" />;

  // DATA-FIRST RENDERING
  if (data) {
    const canCancel = data.status === 'WAITING' || (data.status === 'MATCHED' && data.pool?.status === 'FORMING');
    const pickupName = ZONE_LABELS[data.pickupZone as Zone] || data.pickupZone;
    const dropoffName = ZONE_LABELS[data.dropoffZone as Zone] || data.dropoffZone;

    // Stepper state computation
    // Steps: 1: WAITING, 2: MATCHED, 3: IN_PROGRESS, 4: COMPLETED
    const stepIdx =
      data.status === 'WAITING' ? 1
      : data.status === 'MATCHED' ? 2
      : data.status === 'IN_PROGRESS' ? 3
      : data.status === 'COMPLETED' ? 4
      : 0; // CANCELLED

    const capacity = data.pool?.totalCapacity ?? 3;
    const occupied = data.pool?.occupiedSeats ?? data.requestedSeats;
    const openSlots = Math.max(0, capacity - occupied);

    return (
      <div className="min-h-screen bg-surface text-ink font-sans pb-20 md:pb-0">
        <PassengerSidebar variant="sidebar" active="requests" />

        <main className="md:ml-60 p-4 md:p-8">
          <div className="max-w-[960px] mx-auto space-y-6">
            {/* Top Status Strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-card border border-[rgba(0,0,0,0.06)] rounded-lg p-4 shadow-sm gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${data.status === 'CANCELLED' ? 'bg-danger' : 'bg-success animate-ping'}`} />
                <div>
                  <div className="text-xs font-bold text-ink">
                    Corridor Pool {data.status === 'CANCELLED' ? 'Cancelled' : 'Active'} · {pickupName} → {dropoffName}
                  </div>
                  <div className="text-[10px] text-ink-muted">
                    Tracking ride ID: #{data.id.slice(0, 8)} · Updates every 3s
                  </div>
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 w-fit">
                {data.status === 'WAITING' && 'STAGE 1: WAITING'}
                {data.status === 'MATCHED' && 'STAGE 2: MATCHED'}
                {data.status === 'IN_PROGRESS' && 'STAGE 3: IN TRANSIT'}
                {data.status === 'COMPLETED' && 'STAGE 4: COMPLETED'}
                {data.status === 'CANCELLED' && 'CANCELLED'}
              </div>
            </div>

            {/* Stepper (Horizontal 4-Step) */}
            {data.status !== 'CANCELLED' ? (
              <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-lg p-6 shadow-sm">
                <div className="grid grid-cols-4 gap-2 relative">
                  {/* Connecting line */}
                  <div className="absolute top-4 inset-x-8 h-0.5 bg-zinc-200 z-0" />

                  {/* Step 1: WAITING */}
                  <div className={`relative z-10 flex flex-col items-center text-center ${stepIdx > 1 ? '' : stepIdx === 1 ? '' : 'opacity-40'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                      stepIdx >= 1 ? 'bg-success text-white' : 'bg-zinc-100 text-zinc-400 border-2 border-zinc-300'
                    }`}>
                      {stepIdx > 1 ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        '1'
                      )}
                    </div>
                    <div className="mt-2 text-xs font-bold text-ink">WAITING</div>
                    <div className="text-[11px] text-ink-muted hidden sm:block">
                      {stepIdx === 1 ? 'Finding a driver…' : 'Driver requested'}
                    </div>
                  </div>

                  {/* Step 2: MATCHED */}
                  <div className={`relative z-10 flex flex-col items-center text-center ${stepIdx > 2 ? '' : stepIdx === 2 ? '' : 'opacity-40'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                      stepIdx > 2 ? 'bg-success text-white'
                      : stepIdx === 2 ? 'bg-success text-white ring-4 ring-emerald-100 animate-pulse'
                      : 'bg-zinc-100 text-zinc-400 border-2 border-zinc-300'
                    }`}>
                      {stepIdx > 2 ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        '2'
                      )}
                    </div>
                    <div className={`mt-2 text-xs font-bold ${stepIdx === 2 ? 'text-success' : 'text-ink'}`}>MATCHED</div>
                    <div className="text-[11px] text-ink-muted hidden sm:block">
                      {stepIdx >= 2 ? (data.pool?.driver.fullName ? `${data.pool.driver.fullName} assigned` : 'Driver matched') : 'Awaiting match'}
                    </div>
                  </div>

                  {/* Step 3: IN PROGRESS */}
                  <div className={`relative z-10 flex flex-col items-center text-center ${stepIdx > 3 ? '' : stepIdx === 3 ? '' : 'opacity-40'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                      stepIdx > 3 ? 'bg-success text-white'
                      : stepIdx === 3 ? 'bg-primary text-white ring-4 ring-orange-100 animate-pulse'
                      : 'bg-zinc-100 text-zinc-400 border-2 border-zinc-300'
                    }`}>
                      {stepIdx > 3 ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        '3'
                      )}
                    </div>
                    <div className="mt-2 text-xs font-bold text-ink">IN PROGRESS</div>
                    <div className="text-[11px] text-ink-muted hidden sm:block">
                      {stepIdx >= 3 ? 'On corridor route' : 'En route'}
                    </div>
                  </div>

                  {/* Step 4: COMPLETED */}
                  <div className={`relative z-10 flex flex-col items-center text-center ${stepIdx === 4 ? '' : 'opacity-40'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                      stepIdx === 4 ? 'bg-success text-white' : 'bg-zinc-100 text-zinc-400 border-2 border-zinc-300'
                    }`}>
                      {stepIdx === 4 ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        '4'
                      )}
                    </div>
                    <div className="mt-2 text-xs font-bold text-ink">COMPLETED</div>
                    <div className="text-[11px] text-ink-muted hidden sm:block">
                      {stepIdx === 4 ? 'Trip complete' : 'Dropoff'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 text-danger-dark text-xs font-medium">
                This ride request has been cancelled.
              </div>
            )}

            {/* 2-Col Details Grid: Driver & Pool + Fare Receipt */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left Col: Driver & Pool (7 cols) */}
              <div className="md:col-span-7 space-y-4">
                {/* Driver Card */}
                {data.pool?.driver ? (
                  <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-lg p-5 shadow-sm">
                    <div className="flex items-center justify-between pb-3 border-b border-[rgba(0,0,0,0.05)]">
                      <div className="text-[11px] font-bold text-ink uppercase tracking-wider">Assigned Driver</div>
                      <span className="px-2 py-0.5 rounded-full bg-success/10 text-success flex items-center gap-1 font-semibold text-[10px]">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        VERIFIED DRIVER
                      </span>
                    </div>
                    <div className="pt-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-base flex items-center justify-center border border-primary/20">
                        {data.pool.driver.fullName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-ink">{data.pool.driver.fullName}</h3>
                          <div className="w-4 h-4 rounded-full bg-success text-white flex items-center justify-center text-[10px]">
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        </div>
                        <p className="text-xs text-ink-muted mt-0.5 font-medium">
                          Vehicle: {data.pool.driver.vehicleName} · {capacity} seats
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-lg p-5 shadow-sm text-xs text-ink-muted">
                    Searching for an available driver in the corridor…
                  </div>
                )}

                {/* Capacity Card */}
                {data.pool && (
                  <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-lg p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-bold text-ink uppercase tracking-wider">Corridor Pool Capacity</div>
                      <span className="text-xs font-bold text-ink">
                        {occupied} of {capacity} seats filled
                      </span>
                    </div>

                    {/* 3-seat bar */}
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: capacity }).map((_, i) => {
                        const isFilled = i < occupied;
                        return (
                          <div
                            key={i}
                            className={`h-3 rounded-full ${
                              isFilled
                                ? 'bg-primary'
                                : 'bg-zinc-200 border border-dashed border-zinc-400'
                            }`}
                            title={`Seat ${i + 1}: ${isFilled ? 'Occupied' : 'Open'}`}
                          />
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between text-xs text-ink-muted pt-1">
                      <div className="flex items-center gap-1.5 font-medium text-ink">
                        <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span>{Math.max(0, occupied - data.requestedSeats)} co-rider(s) on corridor</span>
                      </div>
                      <span className="text-[11px] text-warning font-semibold">
                        {openSlots} open slot{openSlots === 1 ? '' : 's'} available
                      </span>
                    </div>
                  </div>
                )}

                {/* Cancellation Area */}
                <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-lg p-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-ink">
                        {canCancel ? 'Cancel ride' : 'Cancellation locked'}
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {canCancel
                          ? 'You can cancel free of charge before driver arrival.'
                          : 'Driver has arrived at pickup or trip in progress.'}
                      </p>
                    </div>

                    {canCancel ? (
                      <button
                        type="button"
                        onClick={onCancel}
                        disabled={actionLoading}
                        className="px-4 py-2 text-xs font-bold text-white bg-danger hover:bg-danger-dark rounded-lg transition disabled:opacity-50"
                      >
                        {actionLoading ? 'Cancelling…' : 'Cancel ride'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="px-3 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-100 rounded cursor-not-allowed"
                      >
                        Cancel locked
                      </button>
                    )}
                  </div>
                  {inlineError && <p className="text-danger-dark text-xs mt-2">{inlineError}</p>}
                </div>
              </div>

              {/* Right Col: Fare Receipt (5 cols) */}
              <div className="md:col-span-5 space-y-4">
                <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-lg p-5 shadow-sm">
                  <div className="flex items-baseline justify-between pb-3 border-b border-[rgba(0,0,0,0.06)]">
                    <span className="text-[11px] font-bold text-ink uppercase tracking-wider">Fare Receipt</span>
                    <span className="text-xl font-extrabold text-ink tabular-nums">
                      ৳{(data.pricing.totalPooledFarePoysha / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="py-3 space-y-2 text-xs">
                    <div className="flex justify-between text-ink-muted">
                      <span>Rate per seat</span>
                      <span className="tabular-nums font-semibold text-ink">
                        ৳{(data.pricing.perSeatPooledFarePoysha / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-ink-muted">
                      <span>Reserved seats</span>
                      <span className="tabular-nums font-semibold text-ink">{data.requestedSeats}</span>
                    </div>
                    <div className="flex justify-between text-ink-muted">
                      <span>Pickup zone</span>
                      <span className="font-semibold text-ink">{pickupName}</span>
                    </div>
                    <div className="flex justify-between text-ink-muted">
                      <span>Dropoff zone</span>
                      <span className="font-semibold text-ink">{dropoffName}</span>
                    </div>
                    <div className="pt-2 border-t border-zinc-200 flex justify-between items-baseline font-bold text-ink">
                      <span>Total charged</span>
                      <span className="text-lg tabular-nums text-primary">
                        ৳{(data.pricing.totalPooledFarePoysha / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[rgba(0,0,0,0.05)] text-center">
                    <Link
                      href="/passenger/history"
                      className="text-xs text-primary font-medium hover:underline"
                    >
                      View all ride history →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        <PassengerSidebar variant="bottom-nav" active="requests" />
      </div>
    );
  }

  if (loading) return <LoadingState label="Loading ride…" />;

  if (error) return <ErrorState message={error.message} backHref="/passenger/history" backLabel="Back to history" />;

  return null;
}
