import { Zone, ZONE_LABELS } from '@/lib/zones';

interface RequestItem {
  id: string;
  passengerName: string;
  pickupZone: string;
  dropoffZone: string;
  requestedSeats: number;
  provisionalPooledFarePoysha: number;
}

interface RequestCardProps {
  request: RequestItem;
  onAccept: (id: string) => void;
}

export function RequestCard({ request, onAccept }: RequestCardProps) {
  return (
    <div className="bg-card border border-[rgba(0,0,0,0.06)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-primary/40 transition">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
          {request.passengerName.charAt(0)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-ink">{request.passengerName}</span>
            <span className="text-xs text-ink-muted">· {request.requestedSeats} {request.requestedSeats === 1 ? 'seat' : 'seats'}</span>
          </div>
          <div className="text-xs text-ink-muted mt-0.5">
            {ZONE_LABELS[request.pickupZone as Zone] ?? request.pickupZone} → {ZONE_LABELS[request.dropoffZone as Zone] ?? request.dropoffZone}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-5 border-t sm:border-t-0 pt-3 sm:pt-0 border-[rgba(0,0,0,0.04)]">
        <div className="text-right">
          <span className="text-[10px] text-ink-muted block uppercase font-medium">Estimated Fare</span>
          <span className="text-sm font-bold tabular-nums text-ink">
            ৳{(request.provisionalPooledFarePoysha / 100).toFixed(2)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAccept(request.id)}
          className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-semibold text-xs rounded-lg transition shadow-sm"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
