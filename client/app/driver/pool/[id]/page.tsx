'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, uuid, clearToken, isSessionExpired } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { ZONE_LABELS, Zone } from '@/lib/zones';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { pushToast } from '@/lib/useToast';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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
  const { isAuthorized } = useRequireAuth('driver');
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const poolId = params.id;
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Terminal state flag — once the pool has transitioned to COMPLETED or CANCELLED,
  // we are navigating away. Disable fast polling and suppress the "No active pool" flash.
  const [finished, setFinished] = useState(false);

  const { data, error, loading, refresh } = usePolling<CurrentResponse>(
    () => apiFetch<CurrentResponse>('/api/driver/pools/current', { role: 'driver' }),
    finished ? 60_000 : 3_000
  );

  useEffect(() => {
    if (isSessionExpired(error)) {
      clearToken('driver');
      router.push('/login');
    }
  }, [error, router]);

  const previousCountRef = useRef<number | null>(null);

  useEffect(() => {
    const current = data?.pool?.passengers?.length ?? null;
    const previous = previousCountRef.current;
    if (current !== null && previous !== null && current < previous) {
      pushToast('A passenger cancelled. Occupancy updated.', 'info');
    }
    if (current !== null) previousCountRef.current = current;
  }, [data?.pool?.passengers]);

  async function onAdvance(target: 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED') {
    setInlineError(null);
    setActionLoading(true);
    try {
      await apiFetch(`/api/driver/pools/${poolId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: target }),
        role: 'driver',
      });
      pushToast(`Trip status: ${target}`, 'success');
      if (target === 'COMPLETED') {
        setFinished(true);
        router.push('/driver/history');
        return;
      }
      await refresh();
    } catch (err) {
      if (isSessionExpired(err)) { clearToken('driver'); router.push('/login'); return; }
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
    setConfirmOpen(true);
  }

  async function doCancelPool() {
    setConfirmOpen(false);
    setInlineError(null);
    setActionLoading(true);
    try {
      await apiFetch(`/api/driver/pools/${poolId}/cancel`, {
        method: 'POST',
        idempotencyKey: uuid(),
        role: 'driver',
      });
      pushToast('Pool cancelled. Passengers returned to the waiting queue.', 'success');
      setFinished(true);
      router.push('/driver/dashboard');
    } catch (err) {
      if (isSessionExpired(err)) { clearToken('driver'); router.push('/login'); return; }
      if (err instanceof Error) {
        if (err.message === 'INVALID_TRANSITION') setInlineError('Cannot cancel pool once trip has started.');
        else if (err.message === 'POOL_NOT_FOUND') setInlineError('Pool not found.');
        else setInlineError(err.message);
        pushToast(`Cancellation failed: ${err.message}`, 'danger');
      }
    } finally {
      setActionLoading(false);
    }
  }

  // DATA-FIRST RENDERING
  if (!isAuthorized) return <LoadingState label="Checking session…" />;
  if (data) {
    const pool = data.pool;
    if (!pool || pool.id !== poolId) {
      if (finished) return <LoadingState label="Finishing…" />;
      return <ErrorState message="No active pool with that ID." backHref="/driver/dashboard" backLabel="Back to dashboard" />;
    }

    const fromLabel = ZONE_LABELS[pool.initialPickupZone as Zone] ?? pool.initialPickupZone;
    const toLabel = ZONE_LABELS[pool.farthestDropoffZone as Zone] ?? pool.farthestDropoffZone;
    const openSlots = Math.max(0, pool.totalCapacity - pool.occupiedSeats);

    const statusStep =
      pool.status === 'FORMING' ? 1
      : pool.status === 'ARRIVED' ? 2
      : pool.status === 'IN_TRANSIT' ? 3
      : pool.status === 'COMPLETED' ? 4
      : 0;

    return (
      <div className="min-h-screen bg-surface text-ink font-sans pb-20 md:pb-0">
        <ConfirmDialog
          open={confirmOpen}
          title="Cancel this pool?"
          message="All passengers will be returned to the waiting queue. This cannot be undone."
          confirmLabel="Yes, cancel pool"
          cancelLabel="Keep pool"
          variant="warning"
          onConfirm={doCancelPool}
          onCancel={() => setConfirmOpen(false)}
        />

        <main className="p-4 md:p-8">
          <div className="max-w-[960px] mx-auto space-y-6">

            {/* Top strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[rgba(0,0,0,0.08)] gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Link href="/driver/dashboard" className="text-xs text-ink-muted hover:text-primary transition font-medium flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
                    Dashboard
                  </Link>
                  <span className="text-ink-muted/40">/</span>
                  <span className="text-xs font-semibold text-ink">Pool Controls</span>
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight text-ink">Pool Controls</h1>
                <p className="text-xs text-ink-muted mt-0.5">{fromLabel} → {toLabel} · #{pool.id.slice(0, 8)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={pool.status} />
                <span className="text-xs font-semibold text-ink-muted">
                  {pool.occupiedSeats}/{pool.totalCapacity} seats
                </span>
              </div>
            </div>

            {/* Progress steps */}
            <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-sm">
              <div className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-5">Trip Progress</div>
              <div className="grid grid-cols-4 gap-2 relative">
                <div className="absolute top-4 inset-x-8 h-0.5 bg-zinc-200 z-0" />
                {(['FORMING', 'ARRIVED', 'IN_TRANSIT', 'COMPLETED'] as const).map((s, i) => {
                  const stepNum = i + 1;
                  const done = statusStep > stepNum;
                  const active = statusStep === stepNum;
                  const labels = ['Forming', 'Arrived', 'In Transit', 'Completed'];
                  return (
                    <div key={s} className={`relative z-10 flex flex-col items-center text-center ${(!done && !active) ? 'opacity-40' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                        done ? 'bg-success text-white'
                        : active ? 'bg-primary text-white ring-4 ring-primary/20 animate-pulse'
                        : 'bg-zinc-100 text-zinc-400 border-2 border-zinc-300'
                      }`}>
                        {done ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : stepNum}
                      </div>
                      <div className={`mt-2 text-xs font-bold ${active ? 'text-primary' : 'text-ink'}`}>{labels[i]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Seat capacity bar */}
            <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">Seat Occupancy</div>
                <span className="text-xs font-bold text-ink">{pool.occupiedSeats} of {pool.totalCapacity} filled · <span className="text-primary">{openSlots} open</span></span>
              </div>
              <div className="flex items-center gap-2">
                {Array.from({ length: pool.totalCapacity }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-3 rounded-full ${
                      i < pool.occupiedSeats ? 'bg-primary' : 'bg-zinc-200 border-2 border-dashed border-zinc-300'
                    }`}
                    title={`Seat ${i + 1}: ${i < pool.occupiedSeats ? 'Occupied' : 'Open'}`}
                  />
                ))}
              </div>
            </div>

            {/* Passenger manifest */}
            <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">Passenger Manifest</div>
                <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">{pool.passengers.length} on board</span>
              </div>
              {pool.passengers.length === 0 ? (
                <p className="text-xs text-ink-muted text-center py-4">No passengers yet.</p>
              ) : (
                <div className="border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-ink">
                    <thead className="bg-surface text-ink-muted font-bold border-b border-[rgba(0,0,0,0.06)]">
                      <tr>
                        <th className="py-2.5 px-4">Passenger</th>
                        <th className="py-2.5 px-4">Seats</th>
                        <th className="py-2.5 px-4">Corridor</th>
                        <th className="py-2.5 px-4 text-right">Fare</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(0,0,0,0.04)] font-medium bg-card">
                      {pool.passengers.map((p, idx) => (
                        <tr key={p.requestId} className="hover:bg-surface/50 transition-colors">
                          <td className="py-3 px-4 font-bold text-ink">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                                {p.passengerName.charAt(0)}
                              </span>
                              {p.passengerName}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-surface border border-[rgba(0,0,0,0.06)] font-mono font-bold text-[11px] text-ink">
                              Seat {idx + 1}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium text-ink">
                            {ZONE_LABELS[p.pickupZone as Zone] ?? p.pickupZone} → {ZONE_LABELS[p.dropoffZone as Zone] ?? p.dropoffZone}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-ink">
                            ৳{(p.individualFarePoysha / 100).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Actions */}
            {inlineError && (
              <div className="bg-danger/10 text-danger-dark p-3 rounded-lg text-xs font-medium">{inlineError}</div>
            )}

            <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-2xl p-5 shadow-sm">
              <div className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-4">Pool Actions</div>
              <div className="flex flex-wrap gap-3">
                {pool.status === 'FORMING' && (
                  <>
                    <button
                      onClick={() => onAdvance('ARRIVED')}
                      disabled={actionLoading}
                      className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
                    >
                      Mark Arrived at Pickup
                    </button>
                    <button
                      onClick={onCancelPool}
                      disabled={actionLoading}
                      className="px-5 py-2.5 bg-surface-alt hover:bg-[#e4e1db] border border-danger/30 text-danger text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
                    >
                      Cancel Pool
                    </button>
                  </>
                )}
                {pool.status === 'ARRIVED' && (
                  <>
                    <button
                      onClick={() => onAdvance('IN_TRANSIT')}
                      disabled={actionLoading}
                      className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
                    >
                      Start Trip
                    </button>
                    <button
                      onClick={onCancelPool}
                      disabled={actionLoading}
                      className="px-5 py-2.5 bg-surface-alt hover:bg-[#e4e1db] border border-danger/30 text-danger text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
                    >
                      Cancel Pool
                    </button>
                  </>
                )}
                {pool.status === 'IN_TRANSIT' && (
                  <button
                    onClick={() => onAdvance('COMPLETED')}
                    disabled={actionLoading}
                    className="px-5 py-2.5 bg-success hover:bg-success-dark text-white text-xs font-bold rounded-xl shadow-sm transition disabled:opacity-50"
                  >
                    Complete Trip
                  </button>
                )}
              </div>
            </div>

          </div>
        </main>
      </div>
    );
  }

  if (loading) return <LoadingState label="Loading pool…" />;
  if (error) return <ErrorState message={error.message} backHref="/driver/dashboard" backLabel="Back to dashboard" />;
  return null;
}
