import { Zone, ZONE_LABELS } from '@/lib/zones';
import { StatusBadge } from '@/components/StatusBadge';
import Link from 'next/link';

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

interface ActivePoolCardProps {
  pool?: Pool | null;
}

export function ActivePoolCard({ pool }: ActivePoolCardProps) {
  return (
    <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-[rgba(0,0,0,0.06)] gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">Active Pool Session</span>
            {pool ? (
              <>
                <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                  #{pool.id.slice(0, 8)}
                </span>
                <StatusBadge status={pool.status} />
              </>
            ) : (
              <span className="text-xs text-ink-muted">No Active Pool</span>
            )}
          </div>
          <h2 className="text-lg font-bold text-ink tracking-tight">
            {pool ? `${ZONE_LABELS[pool.initialPickupZone as Zone] ?? pool.initialPickupZone} → ${ZONE_LABELS[pool.farthestDropoffZone as Zone] ?? pool.farthestDropoffZone}` : 'Your Current Pool'}
          </h2>
        </div>

        {pool && (
          <div className="flex flex-col sm:items-end gap-1.5">
            <div className="text-xs font-semibold text-ink-muted flex items-center gap-1.5">
              <span>Capacity:</span>
              <strong className="text-ink font-bold tabular-nums">
                {pool.occupiedSeats} of {pool.totalCapacity} filled
              </strong>
              <span className="text-primary font-semibold text-[11px]">
                ({Math.max(0, pool.totalCapacity - pool.occupiedSeats)} open)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: pool.totalCapacity }).map((_, i) => (
                <div
                  key={i}
                  className={`w-14 h-2 rounded-full ${
                    i < pool.occupiedSeats
                      ? 'bg-primary'
                      : 'border-2 border-dashed border-zinc-300 bg-zinc-100'
                  }`}
                  title={`Seat ${i + 1}: ${i < pool.occupiedSeats ? 'Occupied' : 'Open'}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {pool ? (
        <div className="mt-5 space-y-4">
          <h3 className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-2">
            Matched Passenger Manifest ({pool.passengers.length})
          </h3>
          <div className="border border-[rgba(0,0,0,0.06)] rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs text-ink">
              <thead className="bg-surface text-ink-muted font-bold border-b border-[rgba(0,0,0,0.06)]">
                <tr>
                  <th className="py-2.5 px-4">Passenger</th>
                  <th className="py-2.5 px-4">Seats</th>
                  <th className="py-2.5 px-4">Trip Corridor</th>
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
                        <span>{p.passengerName}</span>
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

          <div className="pt-2 flex justify-end">
            <Link
              href={`/driver/pool/${pool.id}`}
              className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-bold text-xs rounded-xl shadow-sm transition"
            >
              View Pool Controls →
            </Link>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-ink-muted">
          No active pool session right now. Compatible corridor requests will show below when you are online.
        </div>
      )}
    </div>
  );
}
