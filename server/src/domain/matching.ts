import { Zone, shortestDistanceKm } from './routes';

export type CompatibilityResult =
  | { ok: true }
  | { ok: false; code: 'INCOMPATIBLE_ROUTE' | 'CAPACITY_EXCEEDED' };

export function isCompatible(
  candidate: { pickupZone: Zone; dropoffZone: Zone; requestedSeats: number },
  pool: {
    initialPickupZone: Zone;
    pickupToFarthestKm: number;
    occupiedSeats: number;
    totalCapacity: number;
    status: 'FORMING' | 'ARRIVED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  }
): CompatibilityResult {
  if (pool.status !== 'FORMING') {
    return { ok: false, code: 'INCOMPATIBLE_ROUTE' };
  }

  if (candidate.pickupZone !== pool.initialPickupZone) {
    return { ok: false, code: 'INCOMPATIBLE_ROUTE' };
  }

  const candidateDistance = shortestDistanceKm(pool.initialPickupZone, candidate.dropoffZone);
  if (candidateDistance > pool.pickupToFarthestKm) {
    return { ok: false, code: 'INCOMPATIBLE_ROUTE' };
  }

  if (pool.occupiedSeats + candidate.requestedSeats > pool.totalCapacity) {
    return { ok: false, code: 'CAPACITY_EXCEEDED' };
  }

  return { ok: true };
}
