import { isCompatible } from '../src/domain/matching';

describe('matching', () => {
  it('returns ok for compatible candidate and pool', () => {
    const candidate = { pickupZone: 'BANANI' as const, dropoffZone: 'GULSHAN_1' as const, requestedSeats: 1 };
    const pool = {
      initialPickupZone: 'BANANI' as const,
      pickupToFarthestKm: 4,
      occupiedSeats: 1,
      totalCapacity: 3,
      status: 'FORMING' as const,
    };
    expect(isCompatible(candidate, pool)).toEqual({ ok: true });
  });

  it('rejects candidate with incompatible pickup zone', () => {
    const candidate = { pickupZone: 'GULSHAN_1' as const, dropoffZone: 'MOHAKHALI' as const, requestedSeats: 1 };
    const pool = {
      initialPickupZone: 'BANANI' as const,
      pickupToFarthestKm: 4,
      occupiedSeats: 1,
      totalCapacity: 3,
      status: 'FORMING' as const,
    };
    expect(isCompatible(candidate, pool)).toEqual({ ok: false, code: 'INCOMPATIBLE_ROUTE' });
  });

  it('rejects candidate whose dropoff exceeds pool farthest distance', () => {
    const candidate = { pickupZone: 'BANANI' as const, dropoffZone: 'FARMGATE' as const, requestedSeats: 1 };
    const pool = {
      initialPickupZone: 'BANANI' as const,
      pickupToFarthestKm: 4,
      occupiedSeats: 1,
      totalCapacity: 3,
      status: 'FORMING' as const,
    };
    expect(isCompatible(candidate, pool)).toEqual({ ok: false, code: 'INCOMPATIBLE_ROUTE' });
  });

  it('rejects candidate when requested seats exceed available capacity', () => {
    const candidate = { pickupZone: 'BANANI' as const, dropoffZone: 'MOHAKHALI' as const, requestedSeats: 2 };
    const pool = {
      initialPickupZone: 'BANANI' as const,
      pickupToFarthestKm: 4,
      occupiedSeats: 2,
      totalCapacity: 3,
      status: 'FORMING' as const,
    };
    expect(isCompatible(candidate, pool)).toEqual({ ok: false, code: 'CAPACITY_EXCEEDED' });
  });

  it('rejects candidate when pool is not in FORMING status', () => {
    const candidate = { pickupZone: 'BANANI' as const, dropoffZone: 'GULSHAN_1' as const, requestedSeats: 1 };
    const pool = {
      initialPickupZone: 'BANANI' as const,
      pickupToFarthestKm: 4,
      occupiedSeats: 1,
      totalCapacity: 3,
      status: 'ARRIVED' as const,
    };
    expect(isCompatible(candidate, pool)).toEqual({ ok: false, code: 'INCOMPATIBLE_ROUTE' });
  });
});
