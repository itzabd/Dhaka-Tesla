import { calculateFare, MAX_VEHICLE_CAPACITY } from '../src/domain/fare';

describe('fare', () => {
  it('calculates per seat pooled fare correctly', () => {
    expect(calculateFare('BANANI', 'MOHAKHALI', 1).perSeatFarePoysha).toBe(7200);
    expect(calculateFare('BANANI', 'GULSHAN_1', 1).perSeatFarePoysha).toBe(4800);
  });

  it('calculates solo fare and pool discount accurately', () => {
    const calc = calculateFare('BANANI', 'MOHAKHALI', 1);
    expect(calc.soloFarePoysha).toBe(9000);
    expect(calc.poolDiscountPoysha).toBe(1800);
  });

  it('calculates total fare for multiple seats', () => {
    expect(calculateFare('BANANI', 'MOHAKHALI', 2).totalFarePoysha).toBe(14400);
    expect(calculateFare('BANANI', 'GULSHAN_1', 3).totalFarePoysha).toBe(14400);
  });

  it('exposes maximum vehicle capacity as 3', () => {
    expect(MAX_VEHICLE_CAPACITY).toBe(3);
  });
});
