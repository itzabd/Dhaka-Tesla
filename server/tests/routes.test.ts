import { shortestDistanceKm } from '../src/domain/routes';

describe('routes', () => {
  it('calculates shortest distance between adjacent zones', () => {
    expect(shortestDistanceKm('BANANI', 'MOHAKHALI')).toBe(4);
    expect(shortestDistanceKm('MOHAKHALI', 'BANANI')).toBe(4);
    expect(shortestDistanceKm('BANANI', 'GULSHAN_1')).toBe(2);
  });

  it('calculates shortest distance across multiple hops', () => {
    expect(shortestDistanceKm('BANANI', 'FARMGATE')).toBe(7);
    expect(shortestDistanceKm('UTTARA', 'FARMGATE')).toBe(18);
  });

  it('returns 0 when from and to are the same zone', () => {
    expect(shortestDistanceKm('BANANI', 'BANANI')).toBe(0);
  });
});
