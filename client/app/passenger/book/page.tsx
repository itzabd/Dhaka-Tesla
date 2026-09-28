'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, uuid, clearToken, isSessionExpired } from '@/lib/api';
import { ZONES, ZONE_LABELS, Zone } from '@/lib/zones';
import { previewFare, BASE_FARE_POYSHA, PER_KM_POYSHA } from '@/lib/fare';
import { useRequireAuth } from '@/lib/useRequireAuth';
import { PassengerSidebar } from '@/components/PassengerSidebar';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';

interface BookResponse {
  id: string;
  pricing: {
    distanceKm: number;
    perSeatSoloFarePoysha: number;
    perSeatPooledFarePoysha: number;
    totalPooledFarePoysha: number;
    currency: string;
  };
}

const PRESET_CORRIDORS: Array<{ label: string; pickup: Zone; dropoff: Zone }> = [
  { label: 'Banani → Mohakhali', pickup: 'BANANI', dropoff: 'MOHAKHALI' },
  { label: 'Banani → Gulshan 1', pickup: 'BANANI', dropoff: 'GULSHAN_1' },
  { label: 'Banani → Farmgate', pickup: 'BANANI', dropoff: 'FARMGATE' },
];

export default function BookRidePage() {
  const { isAuthorized } = useRequireAuth();
  const router = useRouter();
  const [pickupZone, setPickupZone] = useState<Zone>('BANANI');
  const [dropoffZone, setDropoffZone] = useState<Zone>('MOHAKHALI');
  const [requestedSeats, setRequestedSeats] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookedRide, setBookedRide] = useState<BookResponse | null>(null);

  // Compute live client-side preview fare
  const fareCalc = previewFare({
    pickupZone,
    dropoffZone,
    requestedSeats,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<BookResponse>('/api/rides', {
        method: 'POST',
        idempotencyKey: uuid(),
        body: JSON.stringify({ pickupZone, dropoffZone, requestedSeats }),
      });
      setBookedRide(data);
      router.push(`/passenger/ride/${data.id}`);
    } catch (err) {
      if (isSessionExpired(err)) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setLoading(false);
    }
  }

  // Active pricing values: if booked, server pricing overrides client calculation
  const distanceKm = bookedRide ? bookedRide.pricing.distanceKm : (fareCalc?.distanceKm ?? 0);
  const perSeatPoysha = bookedRide ? bookedRide.pricing.perSeatPooledFarePoysha : (fareCalc?.perSeatPoysha ?? 0);
  const totalPoysha = bookedRide ? bookedRide.pricing.totalPooledFarePoysha : (fareCalc?.totalPoysha ?? 0);
  const soloBasePoysha = BASE_FARE_POYSHA;
  const distancePoysha = distanceKm * PER_KM_POYSHA;
  const subtotalPoysha = soloBasePoysha + distancePoysha;
  const discountPoysha = Math.floor(subtotalPoysha * 0.20);

  if (!isAuthorized) return <LoadingState label="Checking session…" />;

  return (
    <div className="min-h-screen bg-surface text-ink font-sans pb-20 md:pb-0">
      <PassengerSidebar variant="sidebar" active="dashboard" />

      <main className="md:ml-60 p-4 md:p-8">
        <div className="max-w-[960px] mx-auto space-y-6">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-ink tracking-tight">Book a ride</h1>
              <p className="text-xs text-ink-muted mt-1 font-medium">Bullet · 3 seats</p>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-success/10 text-success border border-success/20 w-fit">
              <span className="w-2 h-2 rounded-full bg-success" />
              SHARED CORRIDOR POOLING
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <div className="text-[10px] font-semibold text-ink-muted mb-2 uppercase tracking-wider">
              Frequent Corridor Presets
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_CORRIDORS.map((preset) => {
                const isSelected = pickupZone === preset.pickup && dropoffZone === preset.dropoff;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setPickupZone(preset.pickup);
                      setDropoffZone(preset.dropoff);
                      setBookedRide(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition flex items-center gap-1.5 shadow-sm ${
                      isSelected
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-white border-[rgba(0,0,0,0.08)] text-ink hover:border-primary'
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <ErrorState message={error} />}

          {/* 2-Column Wide Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left Col: Booking Controls (7 cols) */}
            <div className="md:col-span-7 space-y-4">
              <form onSubmit={handleSubmit} className="bg-card border border-[rgba(0,0,0,0.06)] rounded-lg p-5 shadow-sm space-y-4">
                {/* Pickup Zone */}
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Pickup zone</label>
                  <div className="relative">
                    <select
                      value={pickupZone}
                      onChange={(e) => {
                        setPickupZone(e.target.value as Zone);
                        setBookedRide(null);
                      }}
                      className="w-full text-xs font-semibold bg-surface border border-[rgba(0,0,0,0.08)] rounded-lg py-2.5 px-3 appearance-none focus:outline-none focus:border-primary text-ink"
                    >
                      {ZONES.map((z) => (
                        <option key={z} value={z}>
                          {ZONE_LABELS[z]}
                        </option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 text-ink-muted absolute right-3 top-2.5 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                {/* Dropoff Zone */}
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">Dropoff zone</label>
                  <div className="relative">
                    <select
                      value={dropoffZone}
                      onChange={(e) => {
                        setDropoffZone(e.target.value as Zone);
                        setBookedRide(null);
                      }}
                      className="w-full text-xs font-semibold bg-surface border border-[rgba(0,0,0,0.08)] rounded-lg py-2.5 px-3 appearance-none focus:outline-none focus:border-primary text-ink"
                    >
                      {ZONES.map((z) => (
                        <option key={z} value={z}>
                          {ZONE_LABELS[z]}
                        </option>
                      ))}
                    </select>
                    <svg className="w-4 h-4 text-ink-muted absolute right-3 top-2.5 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                {/* Seat Selector (Pill Group) */}
                <div className="pt-2 border-t border-[rgba(0,0,0,0.05)]">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-ink">Seats to reserve</label>
                    <span className="text-[11px] text-ink-muted font-medium">Max 3 seats</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map((num) => {
                      const isSelected = requestedSeats === num;
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() => {
                            setRequestedSeats(num);
                            setBookedRide(null);
                          }}
                          className={`py-2 px-3 text-xs font-bold rounded-lg border transition flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? 'border-2 border-primary bg-primary/10 text-primary'
                              : 'border border-[rgba(0,0,0,0.08)] bg-surface text-ink hover:border-zinc-400'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            {num === 1 ? (
                              <>
                                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </>
                            ) : (
                              <>
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                              </>
                            )}
                          </svg>
                          <span>{num} {num === 1 ? 'Seat' : 'Seats'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Submit button on mobile inside form */}
                <div className="md:hidden pt-2">
                  <button
                    type="submit"
                    disabled={loading || !!bookedRide}
                    className="w-full min-h-[44px] bg-primary hover:bg-primary-dark text-white font-bold text-xs rounded-lg transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z" />
                    </svg>
                    <span>{loading ? 'Requesting…' : 'Request ride'}</span>
                  </button>
                </div>
              </form>

              {/* Helper Text Card */}
              <div className="bg-amber-50/60 border border-amber-200/50 rounded-lg p-3.5 flex items-start gap-3">
                <svg className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className="text-xs text-ink leading-relaxed">
                  Pooled rides share the same corridor. Your fare is calculated per seat, not split with co-riders.
                </p>
              </div>
            </div>

            {/* Right Col: Live Fare Preview & CTA (5 cols) */}
            <div className="md:col-span-5 space-y-4">
              <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-lg p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[rgba(0,0,0,0.06)]">
                  <span className="text-[11px] font-bold text-ink uppercase tracking-wider">
                    {bookedRide ? 'Ride Confirmed' : 'Live fare preview'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-success/10 text-success font-semibold text-[10px] tracking-wider uppercase">
                    20% POOL SAVED
                  </span>
                </div>

                {fareCalc || bookedRide ? (
                  <div className="py-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between text-ink-muted">
                      <span>Base fare</span>
                      <span className="tabular-nums font-semibold text-ink">
                        ৳{(soloBasePoysha / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-ink-muted">
                      <span>Distance ({distanceKm} km × ৳15)</span>
                      <span className="tabular-nums font-semibold text-ink">
                        ৳{(distancePoysha / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-ink-muted pt-2 border-t border-[rgba(0,0,0,0.04)]">
                      <span>Subtotal</span>
                      <span className="tabular-nums font-semibold text-ink">
                        ৳{(subtotalPoysha / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-primary font-medium">
                      <span>Pool discount (20%)</span>
                      <span className="tabular-nums font-bold">
                        -৳{(discountPoysha / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="pt-3 border-t border-zinc-200 flex items-baseline justify-between">
                      <div>
                        <span className="text-xs font-bold text-ink block">
                          {requestedSeats === 1 ? 'You pay (1 seat)' : `You pay (${requestedSeats} seats)`}
                        </span>
                        <span className="text-[10px] text-ink-muted font-medium">
                          ৳{(perSeatPoysha / 100).toFixed(2)} / seat
                        </span>
                      </div>
                      <span className="text-2xl font-extrabold text-ink tabular-nums">
                        ৳{(totalPoysha / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-ink-muted">
                    Fare will be calculated on submit
                  </div>
                )}

                {/* Primary CTA (Desktop) */}
                <div className="hidden md:block">
                  {!bookedRide ? (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={loading}
                      className="w-full min-h-[44px] bg-primary hover:bg-primary-dark text-white font-bold text-xs rounded-lg transition shadow-sm flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z" />
                      </svg>
                      <span>{loading ? 'Requesting…' : 'Request ride'}</span>
                    </button>
                  ) : (
                    <div className="space-y-2 mt-2">
                      <Link
                        href={`/passenger/ride/${bookedRide.id}`}
                        className="w-full min-h-[44px] bg-primary hover:bg-primary-dark text-white font-bold text-xs rounded-lg transition shadow-sm flex items-center justify-center gap-2"
                      >
                        View status
                      </Link>
                      <button
                        type="button"
                        onClick={() => setBookedRide(null)}
                        className="w-full text-center text-xs text-ink-muted hover:underline py-1"
                      >
                        Book another ride
                      </button>
                    </div>
                  )}
                </div>

                {/* Post-booking action on mobile */}
                {bookedRide && (
                  <div className="md:hidden space-y-2 mt-2">
                    <Link
                      href={`/passenger/ride/${bookedRide.id}`}
                      className="w-full min-h-[44px] bg-primary hover:bg-primary-dark text-white font-bold text-xs rounded-lg transition shadow-sm flex items-center justify-center gap-2"
                    >
                      View status
                    </Link>
                    <button
                      type="button"
                      onClick={() => setBookedRide(null)}
                      className="w-full text-center text-xs text-ink-muted hover:underline py-1"
                    >
                      Book another ride
                    </button>
                  </div>
                )}

                {/* Async Loading State Indicator */}
                {loading && (
                  <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.05)]">
                    <div className="p-2 rounded bg-surface border border-[rgba(0,0,0,0.05)] flex items-center gap-2 text-xs text-ink-muted">
                      <svg className="w-3.5 h-3.5 text-primary animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeLinecap="round" />
                      </svg>
                      <span className="font-medium text-[11px]">Requesting pool ride…</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <PassengerSidebar variant="bottom-nav" active="dashboard" />
    </div>
  );
}
