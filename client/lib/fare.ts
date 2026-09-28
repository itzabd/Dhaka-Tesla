export type Zone = 'UTTARA' | 'AIRPORT' | 'BANANI' | 'GULSHAN_1' | 'MOHAKHALI' | 'FARMGATE';

export const ALL_ZONES: Zone[] = ['UTTARA', 'AIRPORT', 'BANANI', 'GULSHAN_1', 'MOHAKHALI', 'FARMGATE'];

export const ROUTE_EDGES: Array<{ a: Zone; b: Zone; km: number }> = [
  { a: 'UTTARA',    b: 'AIRPORT',   km: 6 },
  { a: 'AIRPORT',   b: 'BANANI',    km: 5 },
  { a: 'BANANI',    b: 'GULSHAN_1', km: 2 },
  { a: 'BANANI',    b: 'MOHAKHALI', km: 4 },
  { a: 'GULSHAN_1', b: 'MOHAKHALI', km: 3 },
  { a: 'MOHAKHALI', b: 'FARMGATE',  km: 3 },
];

function buildAdjacency(): Record<Zone, Record<Zone, number>> {
  const adj: Partial<Record<Zone, Partial<Record<Zone, number>>>> = {};
  for (const z of ALL_ZONES) adj[z] = {};
  for (const { a, b, km } of ROUTE_EDGES) {
    adj[a]![b] = km;
    adj[b]![a] = km;
  }
  return adj as Record<Zone, Record<Zone, number>>;
}

const ADJ = buildAdjacency();

export function shortestDistanceKm(from: Zone, to: Zone): number {
  if (from === to) return 0;
  const dist: Record<string, number> = {};
  const visited = new Set<string>();
  for (const z of ALL_ZONES) dist[z] = Infinity;
  dist[from] = 0;
  while (true) {
    let u: Zone | null = null;
    let best = Infinity;
    for (const z of ALL_ZONES) {
      if (!visited.has(z) && dist[z] < best) { best = dist[z]; u = z; }
    }
    if (u === null) break;
    if (u === to) return dist[u];
    visited.add(u);
    for (const v of Object.keys(ADJ[u]) as Zone[]) {
      const alt = dist[u] + ADJ[u][v];
      if (alt < dist[v]) dist[v] = alt;
    }
  }
  return Infinity;
}

export const BASE_FARE_POYSHA = 3000;
export const PER_KM_POYSHA = 1500;
export const POOL_DISCOUNT_PERCENT = 0.20;

export function previewFare(input: {
  pickupZone: string;
  dropoffZone: string;
  requestedSeats: number;
}): { distanceKm: number; perSeatPoysha: number; totalPoysha: number } | null {
  const km = shortestDistanceKm(input.pickupZone as Zone, input.dropoffZone as Zone);
  if (!isFinite(km)) return null;
  const solo = BASE_FARE_POYSHA + km * PER_KM_POYSHA;
  const discount = Math.floor(solo * POOL_DISCOUNT_PERCENT);
  const perSeatPoysha = solo - discount;
  return {
    distanceKm: km,
    perSeatPoysha,
    totalPoysha: perSeatPoysha * input.requestedSeats,
  };
}
